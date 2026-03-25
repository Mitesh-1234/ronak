import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCOnd3gp0fSkRBlBBg04FDwOn-a1IVwj0g",
    authDomain: "ronak-s-wedding.firebaseapp.com",
    projectId: "ronak-s-wedding",
    storageBucket: "ronak-s-wedding.firebasestorage.app",
    messagingSenderId: "902091649633",
    appId: "1:902091649633:web:d4acc3d736d4174ddff020"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.getElementById('lookupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const refId = document.getElementById('refId').value.trim().toUpperCase();
    const searchBtn = document.getElementById('searchBtn');
    const errorMsg = document.getElementById('errorMsg');
    const itinerary = document.getElementById('itinerary');

    searchBtn.innerText = "Searching...";
    searchBtn.disabled = true;
    errorMsg.style.display = 'none';
    itinerary.style.display = 'none';

    try {
        const q = query(collection(db, "hotelBookings"), where("email", "==", email), where("reference", "==", refId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            errorMsg.style.display = 'block';
        } else {
            // Match found
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                document.getElementById('iName').innerText = data.guestName;
                document.getElementById('iHotel').innerText = data.hotel;
                document.getElementById('iRoom').innerText = data.room;
                document.getElementById('iIn').innerText = data.checkin;
                document.getElementById('iOut').innerText = data.checkout;
                document.getElementById('iPaid').innerText = data.totalPaid;
            });
            itinerary.style.display = 'block';
            // Hide form inputs for a cleaner printed receipt
            document.getElementById('email').parentNode.style.display = 'none';
            document.getElementById('refId').parentNode.style.display = 'none';
            searchBtn.style.display = 'none';
        }
    } catch (error) {
        console.error("Error fetching booking:", error);
        alert("Something went wrong connecting to the database.");
    }

    searchBtn.innerText = "Find Reservation";
    searchBtn.disabled = false;
});
