import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const [status, setStatus] = useState('Connecting to backend...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Calling backend using your Wi-Fi IP address (10.102.139.216)
    fetch('http://10.102.138.91:8000/health')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.status); // Displays "server OK" when connected
        setLoading(false);
      })
      .catch((err) => {
        setStatus('Connection Failed. Check FastAPI backend!');
        setLoading(false);
      });
  }, []);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Text style={styles.text}>{status}</Text>
      )}
      <StatusBar style="auto" />
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
  text: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});