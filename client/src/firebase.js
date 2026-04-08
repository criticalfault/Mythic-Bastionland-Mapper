import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// This is the public Firebase client config — safe to commit.
// See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey: "AIzaSyBj_saxp7a5bf9jfbPJglHfVk6xxf-LqAI",
  authDomain: "mythic-bastionland-mapper.firebaseapp.com",
  projectId: "mythic-bastionland-mapper",
  storageBucket: "mythic-bastionland-mapper.firebasestorage.app",
  messagingSenderId: "722899554986",
  appId: "1:722899554986:web:8c8ba2a1e9467484c776d3",
  measurementId: "G-WMNRQM67BP"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
