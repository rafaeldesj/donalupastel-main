import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAzR9UQyV0xIwYgU9xoTuiEfqwhIiDvIrU",
  authDomain: "dona-lu-4242d.firebaseapp.com",
  projectId: "dona-lu-4242d",
  storageBucket: "dona-lu-4242d.firebasestorage.app",
  messagingSenderId: "87878437306",
  appId: "1:87878437306:web:6bb76b8dadd3e7dbd43583",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try {
  const querySnapshot = await getDocs(collection(db, 'products'));
  querySnapshot.forEach((doc) => {
    console.log(doc.id, "Name:", doc.data().name, "Category:", doc.data().category);
  });
} catch (e) {
  console.error("Error fetching:", e);
}
process.exit(0);
