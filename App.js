import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';
import { Slider } from 'react-native-elements';
import { Switch } from 'react-native';
import * as FileSystem from 'expo-file-system';

export default function App() {
  const [responseReceived, setResponseReceived] = useState(true);
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState('');
  const [englishTranslation, setEnglishTranslation] = useState('');
  const [improvement, setImprovement] = useState('');
  const [transcript, setTranscript] = useState("");
  const [suggestedWord, setSuggestedWord] = useState("");
  const [fullStory, setFullStory] = useState("");
  const [responseAudioURI, setResponseAudioURI] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [level, setLevel] = useState(1);
  const [selectedLanguage, setSelectedLanguage] = useState('hebrew');

  const getConversationHistoryPath = async () => {
    const documentDirectory = await FileSystem.documentDirectory;
    return `${documentDirectory}conversation_history.json`;
  };

  async function readConversationHistory() {
    const fileUri = FileSystem.documentDirectory + 'conversation_history.json';
  
    try {
      // Check if the file exists
      const fileData = await FileSystem.getInfoAsync(fileUri);
      if (!fileData.exists) {
        // If the file does not exist, create it with an empty array
        await FileSystem.writeAsStringAsync(fileUri, JSON.stringify([]));
      }
  
      // Read the conversation history from the file
      const conversationHistoryJSON = await FileSystem.readAsStringAsync(fileUri);
      // console.log("Read conversation history:", JSON.parse(conversationHistoryJSON));
      return JSON.parse(conversationHistoryJSON);
    } catch (error) {
      console.error('Error reading conversation history:', error);
      return [];
    }
  }  
  
  const saveConversationHistory = async (conversationHistory) => {
    const filePath = await getConversationHistoryPath();
    try {
      // console.log("Saving conversation history:", conversationHistory);
      const fileContent = JSON.stringify(conversationHistory, null, 2);
      await FileSystem.writeAsStringAsync(filePath, fileContent);
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  };

  async function saveNewAssistantMessage(generated_response) {
    // console.log('Received generated_response:', generated_response);
    const conversationHistory = await readConversationHistory();
  
    if (typeof generated_response === 'object') {
      // If generated_response is a JSON object, update the conversation history with the new JSON object
      for (const message of generated_response) {
        conversationHistory.push(message);
      }
    } else {
      // If generated_response is a string, push it as the "content" field of a new object in the conversationHistory
      conversationHistory.push({ "role": "assistant", "content": generated_response });
    }
  
    // console.log('New Convo History: ', conversationHistory, '\n\n');
    await saveConversationHistory(conversationHistory);
  }  

  async function resetApp() {
    // Reset your constants here
    setGeneratedResponse('');
    setEnglishTranslation('');
    setImprovement('');
    setTranscript("");
    setResponseAudioURI('');
    setShowTranslation(false);
    setSuggestedWord('');
    setFullStory('');
    // setPlaybackSpeed(1.0);
    // setLevel(1);
    // setSelectedLanguage('hebrew');
  
    // Delete the conversation_history.json file
    const conversationHistoryPath = FileSystem.documentDirectory + 'conversation_history.json';
    await FileSystem.deleteAsync(conversationHistoryPath, { idempotent: true });
  }

  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  async function startRecording() {
    try {
      console.log('Starting recording..');
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }

  async function stopRecording() {
    setResponseReceived(false);
    console.log('Stopping recording..');
    setRecording(undefined);
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    console.log('Recording stopped and stored at', uri);

    try {
      const { sound, status } = await recording.createNewLoadedSoundAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      await newSound.getStatusAsync();
      const audioData = new FormData();
      const fileName = uri.split('/').pop();
      
      audioData.append(
        'audio_data',
        {
          uri: uri,
          type: 'audio/x-caf',
          name: fileName,
        },
        fileName
      );

      audioData.append('playback_speed', playbackSpeed);
      audioData.append('level', level);
      audioData.append('language', selectedLanguage);
      audioData.append('conversation_history', JSON.stringify(await readConversationHistory()));
            
      // console.log('Audio file URI:', uri);
      // console.log('Audio data FormData object:', audioData);
      
      const response = await axios.post('http://192.168.1.137:5000/process_audio', audioData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // console.log('Response from server:', response);
  
      // Inside the stopRecording function, after receiving the response from the server:
      const responseAudioBase64 = response.data.response_audio;
      const responseAudioURI = `data:audio/mp3;base64,${responseAudioBase64}`;
      setResponseAudioURI(responseAudioURI);
      const { sound: responseSound } = await Audio.Sound.createAsync({ uri: responseAudioURI }, { volume: 1.0 });
      // await responseSound.setRateAsync(playbackSpeed, true);
      await responseSound.playAsync();
      setResponseReceived(true);
      // Before the generated response Text component
      // console.log('Generated response:', response.data.generated_response);
      setGeneratedResponse(response.data.generated_response);
      // Before the English translation Text component
      // console.log('English translation:', response.data.english_translation);
      setEnglishTranslation(response.data.english_translation);
      // Before the transcript Text component
      // console.log('Transcript:', response.data.transcript);
      setTranscript(response.data.transcript);
      // Before the improvement Text component
      // console.log('Improvement:', response.data.improvement);
      setImprovement(response.data.improvement);
      setSuggestedWord(response.data.suggestion_text);
      setFullStory(response.data.full_story);
      setShowTranslation(false);

      saveNewAssistantMessage(response.data.conversation_addition)


    } catch (err) {
      console.error('Failed to send audio data:', err);
      setResponseReceived(true);
      setIsRecording(false);
      setShowTranslation(false);
    }
  }

  async function playResponse() {
    if (responseAudioURI) {
      setShowTranslation(true)
      const { sound: responseSound } = await Audio.Sound.createAsync({ uri: responseAudioURI }, { volume: 1.0 });
      // await responseSound.setRateAsync(playbackSpeed, true);
      await responseSound.playAsync();
    }
  }

  return (
    <ScrollView style={styles.container}>
    {/* Top content */}
    <View style={styles.topContent}>
      {/* App Title */}
      <Text style={styles.title}>Tale Tag</Text>
  
      {/* Language Toggle */}
      <View style={styles.languageToggle}>
        <Text style={styles.languageToggleLabel}>Hebrew</Text>
        <Switch
          value={selectedLanguage === 'english'}
          onValueChange={(value) =>
            setSelectedLanguage(value ? 'english' : 'hebrew')
          }
          thumbColor="#1e88e5"
          trackColor={{ false: '#ccc', true: '#ccc' }}
        />
        <Text style={styles.languageToggleLabel}>English</Text>
      </View>
  
      {/* Record Button */}
      <TouchableOpacity
        onPress={isRecording ? stopRecording : startRecording}
        style={[
          styles.recordButton,
          responseReceived ? styles.enabledButton : styles.disabledButton,
        ]}
        disabled={!responseReceived}
      >
        <Text style={styles.buttonText}>
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Text>
      </TouchableOpacity>
      </View>
  
  {/* Middle content */}
  <View style={styles.middleContent}>
      {/* Generated Response */}
      <Text style={styles.sectionTitle}>My Storyline</Text>
<View style={styles.borderedView}>
  <TouchableOpacity
    onPress={() => playResponse()}
    disabled={isRecording || !responseReceived}
    style={isRecording ? styles.disabledButton : styles.enabledButton}
  >
    <Text selectable={true} style={styles.responseText}>{generatedResponse}</Text>
  </TouchableOpacity>
</View>
  
      {/* English Translation */}
      {showTranslation && (
      <Text style={styles.sectionTitle}>My Storyline</Text>)}
      {showTranslation && (
      <View style={styles.borderedView}>
        <Text style={styles.responseText}>{englishTranslation}</Text>
      </View>
    )}
  
      {/* Transcript */}
      <Text style={styles.sectionTitle}>Your Storyline</Text>
      <View style={styles.borderedView}>
  <Text  selectable={true} style={styles.responseText}>
    {transcript}
  </Text>
</View>
  
      {/* Improvement */}
      <Text style={styles.sectionTitle}>Suggested Improvement</Text>
      <View style={styles.borderedView}>
  <Text style={styles.responseText}>
    {improvement}
  </Text>
</View>
      
      {/* Word Suggestion */}
      <Text style={styles.sectionTitle}>Word Challenge</Text>
      <View style={styles.borderedView}>
  <Text style={styles.responseText}>
    {suggestedWord}
  </Text>
</View>
      
      {/* Long block of text */}
      <Text style={styles.sectionTitle}>Full Story</Text>
      <View style={styles.borderedView}>
        <Text style={styles.responseText}>
          {fullStory}
        </Text>
      </View>
    </View>
  
  {/* Bottom content */}
  <View style={styles.bottomContent}>  
      {/* Playback Speed Slider */}
      <Text style={styles.sliderLabel}>
        Playback Speed: {playbackSpeed.toFixed(1)}x
      </Text>
      <Slider
        value={playbackSpeed}
        onValueChange={(value) => setPlaybackSpeed(value)}
        minimumValue={0.5}
        maximumValue={1.0}
        step={0.1}
        style={styles.slider}
        thumbTintColor="#1e88e5"
        minimumTrackTintColor="#1e88e5"
      />
  
      {/* Level Slider */}
      <Text style={styles.sliderLabel}>Level: {level}</Text>
      <Slider
        value={level}
        onValueChange={(value) => setLevel(value)}
        minimumValue={1}
        maximumValue={10}
        step={1}
        style={styles.slider}
        thumbTintColor="#1e88e5"
        minimumTrackTintColor="#1e88e5"
      />
  
      {/* Reset Button */}
      <TouchableOpacity
        onPress={resetApp}
        style={[
          styles.resetButton,
          responseReceived ? styles.enabledButton : styles.disabledButton,
        ]}
        disabled={!responseReceived}
      >
        <Text style={styles.buttonText}>Reset</Text>
      </TouchableOpacity>
    </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Container style
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10, // add some padding around the edge of the container
  },

  // Top content style
  topContent: {
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 16,
  },

  // Middle content style
  middleContent: {
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 20
  },

  // Bottom content style
  bottomContent: {
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 16,
  },

  borderedView: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    alignSelf: 'stretch',
  },

  sectionTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 5, // This will create some space between the title and the bordered view
  },

  // Response text style
  responseText: {
    fontSize: 15,  // increase the font size
    textAlign: 'center',
  },

  // App title style
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ff6347', // tomato color
    letterSpacing: 2,
    textShadowColor: '#ddd',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    marginTop: 40
},

  // Language toggle container style
  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20
  },

  // Record button style
  recordButton: {
    backgroundColor: '#1e88e5',
    borderRadius: 50,
    paddingVertical: 8, // reduce padding
    paddingHorizontal: 24, // reduce padding
    marginTop: 20,
    marginBottom: 20
  },

  // Slider style
  slider: {
    width: '70%', // reduce the width   
    marginBottom: 20, 
  },

  // Reset button style
  resetButton: {
    backgroundColor: '#f44336',
    borderRadius: 50,
    paddingVertical: 8, // reduce padding
    paddingHorizontal: 24, // reduce padding
    marginTop: 20,
    marginBottom: 40, // reduce margin
  },
});