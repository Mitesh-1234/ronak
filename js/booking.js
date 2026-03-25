import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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

// State Machine
let selectedRoom = "";
let basePrice = 0;
let nights = 1;
let totalAmount = 0;
let discount = 0;

// Make Modal Nav functions globally accessible so inline HTML onclicks work
window.nextStep = nextStep;
window.prevStep = prevStep;

// Set default dates and min bounds
const ciInput = document.getElementById('checkin');
const coInput = document.getElementById('checkout');

const todayStr = new Date().toISOString().split('T')[0];
ciInput.min = todayStr;
coInput.min = todayStr;

const dIn = new Date(); dIn.setDate(dIn.getDate() + 30);
const dOut = new Date(); dOut.setDate(dOut.getDate() + 32);
ciInput.value = dIn.toISOString().split('T')[0];
coInput.value = dOut.toISOString().split('T')[0];
// Ensure checkout is never before checkin
const updateCheckoutMin = () => {
        if (ciInput.value) {
            const minOut = new Date(ciInput.value);
            minOut.setDate(minOut.getDate() + 1);
            coInput.min = minOut.toISOString().split('T')[0];
            
            // If current checkout is invalid, push it forward
            if (coInput.value && coInput.value <= ciInput.value) {
                coInput.value = coInput.min;
            }
        }
};
// Initial setup
updateCheckoutMin();

ciInput.addEventListener('change', () => {
    updateCheckoutMin();
    calculateTotal();
});

// Extra guards for mobile browsers
coInput.addEventListener('focus', updateCheckoutMin);
coInput.addEventListener('change', calculateTotal);

// Make it globally accessible for the inline onchange if any
window.updateCheckoutMin = updateCheckoutMin;

// --- Pricing Logic ---
function calculateTotal() {
    const ci = new Date(ciInput.value);
    const co = new Date(coInput.value);
    const diffTime = Math.abs(co - ci);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    nights = diffDays > 0 ? diffDays : 1;

    const subtotal = basePrice * nights;
    const discountAmount = subtotal * discount;
    const discountedSubtotal = subtotal - discountAmount;
    const tax = discountedSubtotal * 0.10;
    totalAmount = discountedSubtotal + tax;

    document.getElementById('paymentTotalDisplay').innerText = '$' + totalAmount.toFixed(2);
}

ciInput.addEventListener('change', () => {
    // Ensure checkout is never before checkin
    coInput.min = ciInput.value;
    if (coInput.value && coInput.value < ciInput.value) {
        const nextDay = new Date(ciInput.value);
        nextDay.setDate(nextDay.getDate() + 1);
        coInput.value = nextDay.toISOString().split('T')[0];
    }
    calculateTotal();
});
coInput.addEventListener('change', calculateTotal);

document.getElementById('applyCouponBtn').addEventListener('click', () => {
    const code = document.getElementById('couponCode').value.toUpperCase();
    if (code === 'RONAKNATASHA26') {
        discount = 0.15;
        document.getElementById('couponMsg').style.display = 'block';
        calculateTotal();
    } else {
        alert("Invalid group code");
        discount = 0;
        document.getElementById('couponMsg').style.display = 'none';
        calculateTotal();
    }
});


// --- Modal Flow Logic ---
const modal = document.getElementById('bookingModal');
const openBtns = document.querySelectorAll('.open-booking-modal');
const steps = [1, 2, 3, 4];

// Open Modal
openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        selectedRoom = btn.dataset.room;
        basePrice = parseFloat(btn.dataset.price);

        document.getElementById('modalRoomTitle').innerText = `Booking: ${selectedRoom}`;
        calculateTotal();

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        showStep(1);
    });
});

// Close Modal
document.getElementById('closeModal').addEventListener('click', () => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restore background scrolling
});

function showStep(stepNumber) {
    // Hide all steps
    document.querySelectorAll('.step-container').forEach(el => el.classList.remove('active'));
    // Remove active classes from dots
    document.querySelectorAll('.step-dot').forEach(el => el.classList.remove('active'));

    const indicator = document.querySelector('.step-indicator');
    const modalContent = document.querySelector('.modal-content');
    if (stepNumber === 4) {
        indicator.style.display = 'none';
        modalContent.style.overflowY = 'hidden';
    } else {
        indicator.style.display = 'flex';
        modalContent.style.overflowY = 'auto';
    }

    // Show current step and activate its dot (and all preceding dots)
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    for (let i = 1; i <= stepNumber; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (dot) dot.classList.add('active');
    }
}

function validateStep1() {
    const name = document.getElementById('guestName').value.trim();
    const email = document.getElementById('guestEmail').value.trim();
    const phone = document.getElementById('guestPhone').value.trim();
    const checkinVal = ciInput.value;
    const checkoutVal = coInput.value;

    if (!name || !email || !phone || !checkinVal || !checkoutVal) {
        alert('Please fill out all required fields (Dates, Name, Email, Phone).');
        return false;
    }

    // iOS ignores the min attribute — validate dates manually in JS
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkinDate = new Date(checkinVal);
    const checkoutDate = new Date(checkoutVal);

    if (checkinDate < today) {
        alert('Check-in date cannot be in the past. Please choose today or a future date.');
        ciInput.focus();
        return false;
    }
    if (checkoutDate <= checkinDate) {
        alert('Check-out date must be at least one day after the check-in date.');
        coInput.focus();
        return false;
    }

    return true;
}

function nextStep(step) {
    if (step === 2 && !validateStep1()) return;
    showStep(step);
}

function prevStep(step) {
    showStep(step);
}


// --- Submission Logic ---
document.getElementById('submitBookingBtn').addEventListener('click', async () => {
    // Payment Validation (Dummy)
    const cardName = document.getElementById('cardName').value;
    const cardNum = document.getElementById('cardNumber').value;
    const cardExp = document.getElementById('cardExpiry').value;
    const cardCvv = document.getElementById('cardCvv').value;

    if (!cardName || !cardNum || !cardExp || !cardCvv) {
        alert("Please fill out all card details (Name, Number, Expiry, CVV) to finalize the booking.");
        return;
    }

    const btn = document.getElementById('submitBookingBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    // Gather Data
    const name = document.getElementById('guestName').value;
    const email = document.getElementById('guestEmail').value;
    const phone = document.getElementById('guestPhone').value;
    const members = document.getElementById('guestMembers').value;

    // Gather Facilities Checkboxes
    const facilitiesChecked = Array.from(document.querySelectorAll('input[name="facilities"]:checked')).map(cb => cb.value);
    const notes = document.getElementById('guestNotes').value;

    const refNumber = "RN" + Math.random().toString(36).substr(2, 6).toUpperCase();
    const totalStr = "$" + totalAmount.toFixed(2);

    const bookingData = {
        hotel: "The Grand Plaza",
        room: selectedRoom,
        guestName: name,
        email: email,
        phone: phone,
        members: members,
        checkin: ciInput.value,
        checkout: coInput.value,
        nights: nights,
        facilitiesRequested: facilitiesChecked,
        notes: notes,
        totalPaid: totalStr,
        reference: refNumber,
        timestamp: new Date().toISOString()
    };

    // 1. Send to Formspree
    let formspreeEndpoint = 'https://formspree.io/f/xanpkwqy';
    try {
        const savedConfig = localStorage.getItem('weddingFormspreeConfig');
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            if (parsed.endpoint) formspreeEndpoint = parsed.endpoint;
        }
    } catch (e) {
        console.error('Error loading formspree config', e);
    }

    if (formspreeEndpoint) {
        const formData = new URLSearchParams();
        formData.append('_subject', `Booking Confirmation - ${refNumber} - The Grand Plaza`);
        formData.append('_replyto', email);
        formData.append('_cc', email);

        const emailContent = `
Dear ${name},

Your reservation at The Grand Plaza is confirmed!

Booking Reference: ${refNumber}
Check-in: ${ciInput.value}
Check-out: ${coInput.value}
Guests: ${members}
Room Type: ${selectedRoom}
Facilities Requested: ${facilitiesChecked.length > 0 ? facilitiesChecked.join(', ') : 'None'}
Total Paid: ${totalStr}

We look forward to celebrating with you!
Ronak & Natasha
        `;

        formData.append('message', emailContent);

        try {
            await fetch(formspreeEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: formData
            });
        } catch (error) {
            console.error('Formspree failure:', error);
        }
    }

    // 2. Save to Firebase
    try {
        await addDoc(collection(db, "hotelBookings"), bookingData);

        // 3. Show Success Step (Step 4)
        document.getElementById('successNameDisplay').innerText = name;
        document.getElementById('successRefDisplay').innerText = refNumber;
        document.getElementById('successGuestNameBox').innerText = name;
        document.getElementById('successHotelBox').innerText = "The Grand Plaza";
        document.getElementById('successGuestsCountBox').innerText = members === '1' ? '1 Guest' : members + ' Guests';
        document.getElementById('successRoomDisplay').innerText = selectedRoom;
        document.getElementById('successCheckInBox').innerText = ciInput.value;
        document.getElementById('successCheckOutBox').innerText = coInput.value;
        document.getElementById('successAmountBox').innerText = totalStr;

        document.getElementById('modalRoomTitle').style.display = 'none'; // hide title in success view
        showStep(4);
    } catch (error) {
        console.error("Booking failed:", error);
        alert("Error securely processing booking. Please try again.");
        btn.innerHTML = '<i class="fas fa-lock"></i> Pay & Book Now';
        btn.disabled = false;
    }
});
