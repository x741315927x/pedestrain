import Paho from "paho-mqtt";
import { useState, useEffect } from "react";
import * as React from "react";
import { StyleSheet, Text, View, Vibration, Platform, Dimensions, ImageBackground, Pressable, Button } from 'react-native';
import { Svg, Circle, Line } from 'react-native-svg';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';

// Don't touch these //
var client;
var ped_id = parseInt(Math.random() * 100);
var futureData = []
var realtimeData = []
var templocation = {
  timestamp: null,
  coords: {
    latitude: null,
    longitude: null,
    speed: null
  }
};
var lasttimestamp = 0
var placename = ""
var aliveglobal = 2
var ttc = -1
var warningreceivedtime = -1
var globallatency = -1

// Change these //


const coords_interval_ms = 5000
const receivetopic = "vikram/columbia/summer2023/fromserver/" + ped_id
const sendtopic = "vikram/columbia/summer2023/toserver"


const vibration_pattern = {
  'android': [
    0, 500, 250, 250, 250 // wait 0s, vibrate .5s, wait .25s, vibrate .25s, wait .25s
  ],
  'ios': [
    0, 250 // wait 0s, vibrate, wait .25s
  ]
}
const alive_chart = {
  0: {
    text: "So far so good",
    color: "#47c906"
  },
  1: {
    text: "DANGER " + ttc + " UNTIL COLLISION",
    color: "#c90606"
  },
  2: {
    text: "Connecting to Server",
    color: "#ffd012"
  },
  3: {
    text: "No Server Connection",
    color: "#033dfc"
  },
  4: {
    text: "Connected to Server",
    color: "#dbd21a"
  },
}

var circlesrad = 7
const circles = [
  {
    'color': "#0000ff",
    'x': 600,
    'y': 736,
    'name': 'blue'
  },
  {
    'color': "#ff0000",
    'x': 107,
    'y': 272,
    'name': 'red'
  },
  {
    'color': "#12a630",
    'x': 728,
    'y': 300,
    'name': 'green'
  },
  {
    'color': "#ff00ff",
    'x': 227,
    'y': 600,
    'name': 'purple'
  },
]

function ping_server (c) {
  // format: msgtype, ped_id_mqtt, lat, long, times, place
  const message = new Paho.Message((
    'ping' + ',' + 
    ped_id + "," + 
    '0' + "," + 
    '0' + ',' +
    '0' + ',' +
    // Date.now()/1000 + ',' + 
    // globallatency + ',' +
    placename
  ).toString());
  message.destinationName = sendtopic;
  try {
    c.send(message);
  } catch {
    console.log("Failed to send message. Try refreshing?")
  }
}

const ScatterPlot = props => {
  
  var gridSizeW = 100;
  var gridSizeH = 100;

  const leftbound = 0
  const upbound = 0
  const rightbound = 832
  const downbound = 832
  var bgimagepath = './assets/intersection_v4.jpg';
  placename = "W 120 at Amsterdam"

  // const leftbound = 0
  // const upbound = 0
  // const rightbound = 1284
  // const downbound = 1386
  // var bgimagepath = './assets/columbia_lawn_v1.png';
  // var placename = "Columbia University Lawn"


  const scale = (rightbound-leftbound) / props.width
  gridSizeH = gridSizeH / scale;
  gridSizeW = gridSizeW / scale;
  const height = parseInt((downbound - upbound) / scale)
  const width = props.width
  // console.log(width, height, scale)
  const intervalsW = parseInt(width / gridSizeW);
  const intervalsH = parseInt(height / gridSizeH);

  return (
    <ImageBackground 
    source={require(bgimagepath)} 
    resizeMode="cover" 
    style={{flex: 1,
      justifyContent: 'center',
      // width:parseInt(width),
      height:height
      }}
    imageStyle={{opacity:0.4}}>
      <Svg style={styles.graph}>



        {circles.map((circle, circleindex) => (
          <Circle
            stroke={circle['color']}
            cx={circle['x'] / scale}
            cy={circle['y'] / scale}
            r={circlesrad}
            key={'circle' + circleindex}
            />
          
        ))}
        

        {Array.from(Array(intervalsW+1)).map((_, index) => (
          <Line
            key={`vertical-${index}`}
            x1={index * gridSizeW}
            y1={0}
            x2={index * gridSizeW}
            y2={height} // Adjust this based on your desired graph height
            stroke="gray"
            strokeWidth="0.25"
          />
        ))}


        {Array.from(Array(intervalsH+1)).map((_, index) => (
          <Line
            key={`horizontal-${index}`}
            x1={0}
            y1={index * gridSizeH}
            x2={width} // Adjust this based on your desired graph width
            y2={index * gridSizeH}
            stroke="gray"
            strokeWidth="0.25"
          />
        ))}


        {props.futuredata.map((vehicle, dataindex) => (
          vehicle.map((point, index) => (
            <Circle
            key={index}
            cx={(point.x - leftbound) / scale}
            cy={(point.y - upbound) / scale}
            r={1}
            fill={point.color}
          />
          ))
          
        ))}

        {props.realtimedata.map((point, dataindex) => (
          <Circle
          key={dataindex}
          cx={(point.x - leftbound) / scale}
          cy={(point.y - upbound) / scale}
          r={3}
          fill={point.color}
        />
        

        ))}

        
      </Svg>
      {/* {console.log(Date.now()/1000 - warningreceivedtime)} */}
      {/* {ping_server(client)} */}
      {/* {console.log("Rendered")} */}

    </ImageBackground>
  );
}

var isPlaying = false;

const App = () => {

  const [good, setalive] = useState(2);

  const [graphWidth, changeGraphWidth] = useState(Dimensions.get("window").height)
  const [graphHeight, changeGraphHeight] = useState(Dimensions.get("window").height)

  const [sound, setSound] = React.useState();
  // var sound = React.useRef(new Audio.Sound());
  // const [isPlaying, setIsPlaying] = useState(false);

  const [location, setLocation] = useState({
    timestamp: null,
    coords: {
      latitude: null,
      longitude: null,
      speed: null
    }
  });
  const [xcoord, setxcoord] = useState(-1)
  const [ycoord, setycoord] = useState(-1)
  const [errorMsg, setErrorMsg] = useState(null);
  const [latency, setlatency] = useState(-1);
  // const [ttc, setttc] = useState(-1);

  async function playSound() {
    if (isPlaying == false) {
      console.log('Loading Sound');
      const {sound} = await Audio.Sound.createAsync( require('./assets/alarm.mp3') );
      setSound(sound);
      // sound = _sound

      console.log('Playing Sound');
      await sound.playAsync();
      // setIsPlaying(true);
      isPlaying = true
    }
  }
  async function stopSound() {
    // console.log(sound)
    // console.log(isPlaying)
    // if (isPlaying) {
    //   await sound.unloadAsync()
    // }
    // isPlaying = false
  }



  function receive(msg) { 
    if (msg.destinationName === receivetopic) {
    lasttimestamp = Date.now()/1000
    // console.log(msg)
    var message = "";
    try {
      // Parse the JSON string into a JavaScript object
      message = JSON.parse(msg.payloadString);
    } catch (error) {
      console.log(msg.payloadString)
      console.error('Error parsing JSON:', error);
    }
    // console.log(message)
    var nowtime = Date.now()/1000

    if (message['status'] === "bad") {
      Vibration.vibrate(vibration_pattern[Platform.OS])      
      // console.log("BAD")
      setalive(1)
      aliveglobal = 1
      ttc = message['ttc']
      // playSound()
      setlatency(nowtime - message['starttime'])
      globallatency = nowtime - message['starttime']
      // warningreceivedtime = nowtime
    }
    else if (message['status'] === "good") {
      Vibration.cancel()
      // console.log("GOOD")
      setalive(0)
      aliveglobal = 0
      // stopSound()
      setlatency(Date.now()/1000 - message['starttime'])
      globallatency = (Date.now()/1000 - message['starttime'])
      // warningreceivedtime = nowtime
    }
    else if (message['status'] === 'info') {
      warningreceivedtime = nowtime
      futureData = []
      realtimeData = []
      message['future']['ped'].forEach((_, ind) => {
        futureData.push(message['future']['ped'][ind])
      })
      message['future']['veh'].forEach((_, ind) => {
        futureData.push(message['future']['veh'][ind])
      })
      message['realtime']['ped'].forEach((_, ind) => {
        realtimeData.push(message['realtime']['ped'][ind])
      })
      message['realtime']['veh'].forEach((_, ind) => {
        realtimeData.push(message['realtime']['veh'][ind])
      })

      setxcoord(message['you']['x'])
      setycoord(message['you']['y'])
      
      // console.log(Date.now()/1000 - message['starttime'])

      if (message['you']['x'] === -2) {
        setalive(4)
      }

      if (aliveglobal === 2 || aliveglobal === 3) {
        setalive(4)
        aliveglobal = 4
      }

      ping_server(client)
    }
    // if (message['strange'] == 1) {
    //   console.log(Date.now()/1000 - testingTime)
    // }
  }}

  useEffect(() => {
    client = new Paho.Client(
      "broker.hivemq.com",
      Number(8000),
      `python-mqtt-${ped_id}`
    );
    client.connect( 
      {
        onSuccess: () => { 
        console.log("Connected!");
        client.subscribe(receivetopic);
        client.onMessageArrived = receive;
      },
      onFailure: () => {
        console.log("Failed to connect!"); 
        setalive(3)
        aliveglobal = 3
      }
      }
    );
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      // Get the initial location
      let initialLocation = await Location.getCurrentPositionAsync({
        // accuracy: Accuracy.High,
        enableHighAccuracy: true
      });
      setLocation(initialLocation);
      // console.log(initialLocation)
      templocation = initialLocation


      const intervalId = setInterval(async () => {
        let updatedLocation = await Location.getCurrentPositionAsync({});
        setLocation(updatedLocation);
        templocation = updatedLocation
        // console.log(templocation.timestamp + ", a")
        // console.log(templocation.coords.speed + ", d")
        // updatedLocation.remove();

      }, coords_interval_ms);

      return () => {
        clearInterval(intervalId);
      };

      // const locationListener = await Location.watchPositionAsync(
      //   { timeInterval: coords_interval_ms },
      //   (newLocation) => {
      //     setLocation(newLocation);
      //     templocation = newLocation
      //     console.log(templocation.timestamp + ", b")
      //     console.log(templocation.coords.speed + ", c")
      //     locationListener.remove();
      //   }
      // );

      // return () => {
      //   if (locationListener) {
      //     locationListener.remove();
      //   }
      // };

      
    })();
    const interval = setInterval(() => {
      var curtime = Date.now()/1000

      // ping_server(client)

      if (lasttimestamp != 0 && curtime - lasttimestamp >= 10) {
        setalive(3)
        aliveglobal = 3
      }
      

    }, coords_interval_ms);
    return () => clearInterval(interval);
  }, [])

  function send_tracking(c, pedx, pedy) {
    // console.log("Sending")
    const message = new Paho.Message((
      'tracking' + ',' + 
      ped_id + "," + 
      pedx + "," + 
      pedy + ',' +
      '0' + ',' + 
      placename
    ).toString());
    message.destinationName = sendtopic;
    try {
      c.send(message);
    } catch {
      console.log("Failed to send message. Try refreshing?")
    }

  }


  return (
    <View style={styles.container}>
      <View style={{height: '20%', alignItems: 'center', justifyContent: 'center',}}>
        <Text style={{color: alive_chart[good]['color'], fontSize: 50}}>
          {alive_chart[good]['text']}
        </Text>
      </View>
      <View style={{height: '40%', alignItems: 'center', justifyContent: 'center'}} onLayout={(event) => {
      var {x, y, width, height} = event.nativeEvent.layout;
      changeGraphHeight(height)
      changeGraphWidth(width)}}>
        <Text>Real Time Graph of Trajectories</Text>
        <ScatterPlot 
          gridSize={10}
          futuredata={futureData}
          realtimedata={realtimeData}
          width={graphWidth}
          height={graphHeight}
        />
        
      </View>
      <View style={{height: '20%', alignItems: 'center', justifyContent: 'center',}}>
        {circles.map((circle, circleindex) => (
          <Pressable
            key = {'button' + circleindex}
            style={{
              backgroundColor: '#ddddee',
              padding: 10,
              margin: 5
            }}
            onPressOut={() => send_tracking(client, circle['x'], circle['y'])}
            >
            <Text style={{
              color: circle['color'],
            }}>I'm at the {circle.name} circle! </Text>
          </Pressable>

          
        ))}
      </View>


      <View style={{height: '10%', alignItems: 'center', justifyContent: 'center',}}>
        <Text>
          Your (X, Y): ({xcoord}, {ycoord}) {'\n'}
          {/* Timestamp: {location.timestamp} */}
          Latency: {latency}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  graph: {
    flex: 1,
    width: 300,
  },
  image: {
    flex: 1,
    justifyContent: 'center',
    width:300,
  },
  circlebutton: {
    backgroundColor: 'blue',
    padding: 10,
  },
});

export default App
