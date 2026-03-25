// Check if the splash screen has been shown in this session
        if (!sessionStorage.getItem('splashShown')) {
            window.addEventListener('load', function () {
                setTimeout(function () {
                    const splash = document.getElementById('welcome-splash');
                    if (splash) {
                        splash.style.opacity = '0';
                        splash.style.visibility = 'hidden';
                        document.body.style.overflow = '';
                        // Mark as shown
                        sessionStorage.setItem('splashShown', 'true');
                        setTimeout(() => splash.remove(), 800);
                    }
                }, 3000);
            });
        } else {
            // Already seen, remove immediately to prevent flashing
            const splash = document.getElementById('welcome-splash');
            if (splash) {
                splash.style.display = 'none';
                document.body.style.overflow = '';
                splash.remove();
            }
        }

// Remove Supabase
        // Initialize Firebase variables
        let firestoreDb;
        let collection, addDoc, getDoc, doc, onSnapshot;

        // Wait for module script to load
        const firebaseInitInterval = setInterval(() => {
            if (window.db && window.firebaseImports) {
                firestoreDb = window.db;
                ({ collection, addDoc, getDoc, doc, onSnapshot } = window.firebaseImports);
                clearInterval(firebaseInitInterval);
                console.log('Firebase initialized in standard script.');
                checkRSVPStatus(); // Call initial functions here
            }
        }, 100);
        let rsvpSettings = {
            enabled: true,
            disabledMessage: 'Thank you for your interest! The RSVP period has now closed. If you have any questions, please contact us directly.'
        };

        // Gallery images data
        const galleryImages = [
            {
                src: 'images/ronak.JPG',
                title: 'Our Engagement',
                description: 'The magical moment we said yes'
            },
            {
                src: 'images/ronak.JPG',
                title: 'Sunset Walks',
                description: 'Evening strolls by the beach'
            },
            {
                src: 'images/ronak.JPG',
                title: 'Travel Adventures',
                description: 'Exploring the world together'
            },
            {
                src: 'images/ronak.JPG',
                title: 'Mountain Getaway',
                description: 'Hiking adventures in the hills'
            },
            {
                src: 'images/ronak.JPG',
                title: 'Romantic Evenings',
                description: 'Candlelit dinners and laughter'
            },
            {
                src: 'images/ronak.JPG',
                title: 'City Lights',
                description: 'Urban adventures and city dreams'
            }
        ];

        let currentImageIndex = 0;

        // Lightbox functions
        function openLightbox(index) {
            currentImageIndex = index;
            const lightbox = document.getElementById('lightbox');
            const lightboxImg = document.getElementById('lightbox-img');
            const lightboxCaption = document.getElementById('lightbox-caption');

            lightboxImg.src = galleryImages[index].src;
            lightboxCaption.innerHTML = `<strong>${galleryImages[index].title}</strong> - ${galleryImages[index].description}`;
            lightbox.style.display = 'flex';

            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            const lightbox = document.getElementById('lightbox');
            lightbox.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function changeImage(direction) {
            currentImageIndex += direction;

            if (currentImageIndex >= galleryImages.length) {
                currentImageIndex = 0;
            } else if (currentImageIndex < 0) {
                currentImageIndex = galleryImages.length - 1;
            }

            const lightboxImg = document.getElementById('lightbox-img');
            const lightboxCaption = document.getElementById('lightbox-caption');

            lightboxImg.src = galleryImages[currentImageIndex].src;
            lightboxCaption.innerHTML = `<strong>${galleryImages[currentImageIndex].title}</strong> - ${galleryImages[currentImageIndex].description}`;
        }

        // Close lightbox when clicking outside the image
        document.getElementById('lightbox').addEventListener('click', function (e) {
            if (e.target === this) {
                closeLightbox();
            }
        });

        // Keyboard navigation for lightbox
        document.addEventListener('keydown', function (e) {
            const lightbox = document.getElementById('lightbox');
            if (lightbox.style.display === 'flex') {
                if (e.key === 'Escape') {
                    closeLightbox();
                } else if (e.key === 'ArrowLeft') {
                    changeImage(-1);
                } else if (e.key === 'ArrowRight') {
                    changeImage(1);
                }
            }
        });

        // Email validation function
        function isValidEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }

        // Show email status
        function showEmailStatus(type, message) {
            document.getElementById('emailLoading').style.display = 'none';
            document.getElementById('emailSuccess').style.display = 'none';
            document.getElementById('emailError').style.display = 'none';

            switch (type) {
                case 'loading':
                    document.getElementById('emailLoading').style.display = 'block';
                    break;
                case 'success':
                    document.getElementById('emailSuccess').style.display = 'block';
                    document.getElementById('emailSuccessText').textContent = message;
                    break;
                case 'error':
                    document.getElementById('emailError').style.display = 'block';
                    document.getElementById('emailErrorText').textContent = message;
                    break;
            }
        }

        // Generate QR Code Image
        function generateQRCodeImage(rsvp_id) {
            const encodedData = encodeURIComponent(rsvp_id);
            return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&data=${encodedData}&format=png&color=000000&bgcolor=FFFFFF&margin=5`;
        }

        // Send RSVP Confirmation Email using EmailJS
        async function sendConfirmationEmail(guestData) {
            if (!isValidEmail(guestData.email)) {
                console.error('Invalid email address:', guestData.email);
                return false;
            }

            let step = 0;
            try {
                step = 1;
                showEmailStatus('loading', 'Sending confirmation email...');

                step = 2;
                const qrCodeUrl = generateQRCodeImage(guestData.rsvp_id);

                step = 3;
                // Format the events attending
                const eventsList = guestData.daysAttending.map(day => {
                    let eventName = '';
                    switch (day) {
                        case 'day1': eventName = '• Day 1 - Welcome Dinner'; break;
                        case 'day2': eventName = '• Day 2 - Wedding Ceremony & Reception'; break;
                        case 'day3': eventName = '• Day 3 - Farewell Brunch'; break;
                    }
                    return eventName;
                }).join('<br>'); // Note use of <br> for HTML email

                step = 4;
                // Format the email template parameters for EmailJS
                const templateParams = {
                    to_email: guestData.email,
                    to_name: `${guestData.first_name} ${guestData.last_name}`,
                    rsvp_id: guestData.rsvp_id,
                    phone: guestData.phone,
                    additional_guests: guestData.guests.length,
                    events_attending: eventsList,
                    qr_code_url: qrCodeUrl,
                    user_message: guestData.message && guestData.message !== '' ? `<br><br><strong>YOUR MESSAGE:</strong> "${guestData.message}"` : ''
                };

                step = 5;
                console.log('Sending RSVP confirmation to:', guestData.email);

                step = 6;
                const response = await emailjs.send(
                    'service_tdfv5cn',    // User's Service ID
                    'template_88gh7ms',   // User's Template ID
                    templateParams
                );

                step = 7;
                if (response.status === 200) {
                    console.log('RSVP confirmation email sent successfully to:', guestData.email);
                    showEmailStatus('success', 'Confirmation email sent successfully!');
                    return true;
                } else {
                    throw new Error('EmailJS request failed with status: ' + response.status);
                }
            } catch (error) {
                console.error('Error sending RSVP confirmation email at step:', step, error);

                // Friendly message — RSVP data is already saved to Firebase, email is non-critical
                if (error && error.status === 0) {
                    // Network/connection error
                    showEmailStatus('error', '⚠️ Email could not be sent (network issue). Your RSVP is saved — please screenshot your QR code below.');
                } else {
                    showEmailStatus('error', '⚠️ Email failed but your RSVP is saved. Please screenshot your QR code below.');
                }
                return false;
            }
        }

        // Initialize Countdown Timer
        function initializeCountdown() {
            const weddingDate = new Date('2026-05-02T17:00:00');

            function updateCountdown() {
                const now = new Date();
                const timeRemaining = weddingDate - now;

                if (timeRemaining < 0) {
                    const countdownContainer = document.querySelector('.countdown-container');
                    if (countdownContainer) {
                        countdownContainer.innerHTML = `
                            <h3>🎉 Today's the Day! 🎉</h3>
                            <p style="color: var(--light); font-size: 1.2rem; margin-top: 10px;">
                                We're getting married today! See you at the ceremony!
                            </p>
                        `;
                    }
                    return;
                }

                const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

                const daysElement = document.getElementById('days');
                const hoursElement = document.getElementById('hours');
                const minutesElement = document.getElementById('minutes');
                const secondsElement = document.getElementById('seconds');

                if (daysElement) daysElement.textContent = days.toString().padStart(2, '0');
                if (hoursElement) hoursElement.textContent = hours.toString().padStart(2, '0');
                if (minutesElement) minutesElement.textContent = minutes.toString().padStart(2, '0');
                if (secondsElement) secondsElement.textContent = seconds.toString().padStart(2, '0');

                updateMilestoneMessage(days);
            }

            function updateMilestoneMessage(days) {
                const title = document.querySelector('.countdown-container h3');
                if (!title) return;

                let message = "Counting Down to Our Special Day";

                if (days === 365) message = "🎉 One Year to Go!";
                else if (days === 100) message = "💝 100 Days Until Forever!";
                else if (days === 30) message = "🌟 One Month Away!";
                else if (days === 14) message = "✨ Two Weeks to Go!";
                else if (days === 7) message = "🎊 Next Week! Get Ready!";
                else if (days === 1) message = "😴 Sleep Well - Tomorrow's the Day!";
                else if (days === 0) message = "🎉 TODAY'S THE DAY! 🎉";

                title.textContent = message;
            }

            updateCountdown();
            setInterval(updateCountdown, 1000);
        }

        // Show notification
        function showNotification(message, duration = 5000) {
            const container = document.getElementById('notificationContainer');
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            notification.style.animation = 'slideIn 0.3s ease';

            container.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, duration);
        }

        // Check RSVP System Status from Firebase
        async function checkRSVPStatus() {
            try {
                if (!firestoreDb) {
                    console.error('Firebase DB not initialized');
                    loadRSVPForm();
                    return;
                }

                const docRef = doc(firestoreDb, 'settings', 'admin');
                const docSnap = await getDoc(docRef);

                let data = null;
                let error = false;

                if (docSnap.exists()) {
                    data = docSnap.data();
                } else {
                    error = true;
                    console.error("No such settings document!");
                }

                if (!error && data) {
                    rsvpSettings.enabled = data.rsvp_enabled;
                    rsvpSettings.disabledMessage = data.disabled_message;
                    console.log('RSVP Settings from Supabase:', rsvpSettings);

                    // Update localStorage
                    localStorage.setItem('weddingRSVPSettings', JSON.stringify(rsvpSettings));
                } else {
                    // Fallback to localStorage
                    const savedSettings = localStorage.getItem('weddingRSVPSettings');
                    if (savedSettings) {
                        rsvpSettings = { ...rsvpSettings, ...JSON.parse(savedSettings) };
                        console.log('RSVP Settings from localStorage:', rsvpSettings);
                    }
                }

                // Display appropriate content
                if (!rsvpSettings.enabled) {
                    showDisabledRSVPMessage();
                } else {
                    loadRSVPForm();
                }

            } catch (error) {
                console.error('Error checking RSVP status:', error);
                loadRSVPForm(); // Fallback to showing form
            }
        }

        // Show disabled RSVP message
        function showDisabledRSVPMessage() {
            const rsvpContainer = document.getElementById('rsvpFormContainer');
            rsvpContainer.innerHTML = `
                <div class="rsvp-disabled-message">
                    <div style="font-size: 4rem; margin-bottom: 20px;">⏰</div>
                    <h3>RSVP Period Has Ended</h3>
                    <p>${rsvpSettings.disabledMessage}</p>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 30px;">
                        <h4>Need Assistance?</h4>
                        <p style="margin: 10px 0;">
                            <i class="fas fa-phone" style="color: var(--primary); margin-right: 10px;"></i>
                            <strong>Phone:</strong> 8200820957
                        </p>
                        <p style="margin: 10px 0;">
                            <i class="fas fa-envelope" style="color: var(--primary); margin-right: 10px;"></i>
                            <strong>Email:</strong> RonakandNatasha2026@example. com
                        </p>
                    </div>
                </div>
            `;
        }

        // Load RSVP Form
        function loadRSVPForm() {
            const rsvpContainer = document.getElementById('rsvpFormContainer');
            rsvpContainer.innerHTML = `
                <div class="success-message" id="successMessage" style="display: none;">
                    <h3 id="successTitle">🎉 Thank you for your RSVP!</h3>
                    <p id="successMessageText">Your RSVP has been confirmed. Please save your QR code below for check-in.</p>
                    <p><strong>RSVP ID:</strong> <span id="rsvpIdDisplay"></span></p>
                    <button onclick="newRSVP()" class="btn" style="margin-top: 15px; background-color: var(--secondary);">
                        Submit Another RSVP
                    </button>
                </div>

                <form id="wedding-rsvp">
                    <div class="form-group">
                        <label for="first_name" class="required">First Name</label>
                        <input type="text" id="first_name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="last_name" class="required">Last Name</label>
                        <input type="text" id="last_name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="email" class="required">Email (Prefered: gmail.com)</label>
                        <input type="email" id="email" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="phone" class="required">Phone Number</label>
                        <input type="tel" id="phone" class="form-control" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="required">Will you be attending our wedding?</label>
                        <div class="attendance-options">
                            <div class="attendance-option">
                                <input type="radio" id="attending-yes" name="attendance" value="yes" checked>
                                <label for="attending-yes">Yes, I'll be there! 🎉</label>
                            </div>
                            <div class="attendance-option">
                                <input type="radio" id="attending-no" name="attendance" value="no">
                                <label for="attending-no">No, I can't make it 😔</label>
                            </div>
                        </div>
                    </div>
                    
                    <div id="events-section">
                        <h3>Additional Guest/s<h3>
                        <div id="guests-container"></div>
                        <button type="button" id="add-guest" class="btn" style="background-color: #8b7355; margin-bottom: 20px;">Add Guest</button>
                        
                        <h3 class="required">Which days will you be attending?</h3>
                        <div class="days-attending">
                            <div class="day-option">
                                <input type="checkbox" id="day1-attend" name="days" value="day1">
                                <label for="day1-attend">Day 1 - Welcome Dinner</label>
                            </div>
                            <div class="day-option">
                                <input type="checkbox" id="day2-attend" name="days" value="day2">
                                <label for="day2-attend">Day 2 - Wedding Day</label>
                            </div>
                            <div class="day-option">
                                <input type="checkbox" id="day3-attend" name="days" value="day3">
                                <label for="day3-attend">Day 3 - Farewell Brunch</label>
                            </div>
                        </div>
                        <div class="error-message" id="daysError">Please select at least one day you will be attending.</div>
                    </div>
                    
                    <div class="form-group">
                        <label for="message">Message for the Couple (Optional)</label>
                        <textarea id="message" class="form-control" rows="3" placeholder="Share your thoughts or wishes..."></textarea>
                    </div>
                    
                    <button type="submit" class="btn" id="submitBtn">Submit RSVP</button>
                </form>
            `;

            // Initialize form functionality
            initializeRSVPForm();
        }

        // Initialize RSVP form functionality
        function initializeRSVPForm() {
            const rsvpForm = document.getElementById('wedding-rsvp');
            const guestsContainer = document.getElementById('guests-container');
            const addGuestBtn = document.getElementById('add-guest');
            const eventsSection = document.getElementById('events-section');
            const attendingYes = document.getElementById('attending-yes');
            const attendingNo = document.getElementById('attending-no');

            let guestCount = 0;

            // Attendance toggle
            function toggleEventsSection() {
                if (attendingYes && attendingYes.checked) {
                    eventsSection.style.display = 'block';
                } else {
                    eventsSection.style.display = 'none';
                }
            }

            if (attendingYes && attendingNo) {
                attendingYes.addEventListener('change', toggleEventsSection);
                attendingNo.addEventListener('change', toggleEventsSection);
                toggleEventsSection();
            }

            // Add guest functionality
            if (addGuestBtn) {
                addGuestBtn.addEventListener('click', () => {
                    guestCount++;
                    const guestItem = document.createElement('div');
                    guestItem.className = 'guest-item';

                    // Generate unique ID based on timestamp to avoid collisions
                    const guestId = Date.now() + Math.floor(Math.random() * 100);

                    guestItem.innerHTML = `
                        <h4 class="guest-number-title">Guest ${guestCount}</h4>
                        <div class="form-group">
                            <label for="guestFirstName${guestId}">First Name</label>
                            <input type="text" id="guestFirstName${guestId}" class="form-control guest-first-name" required>
                        </div>
                        <div class="form-group">
                            <label for="guestLastName${guestId}">Last Name</label>
                            <input type="text" id="guestLastName${guestId}" class="form-control guest-last-name" required>
                        </div>
                        <button type="button" class="remove-guest">&times;</button>
                    `;

                    guestsContainer.appendChild(guestItem);

                    const removeBtn = guestItem.querySelector('.remove-guest');
                    removeBtn.addEventListener('click', () => {
                        guestsContainer.removeChild(guestItem);
                        guestCount--;
                        // Recalculate guest numbers after removal
                        const allGuests = guestsContainer.querySelectorAll('.guest-item');
                        allGuests.forEach((item, index) => {
                            const title = item.querySelector('.guest-number-title');
                            if (title) {
                                title.textContent = `Guest ${index + 1}`;
                            }
                        });
                    });
                });
            }

            // Form submission
            if (rsvpForm) {
                rsvpForm.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const first_name = document.getElementById('first_name').value;
                    const last_name = document.getElementById('last_name').value;
                    const email = document.getElementById('email').value;
                    const phone = document.getElementById('phone').value;
                    const isAttending = document.getElementById('attending-yes').checked;

                    if (!isValidEmail(email)) {
                        alert('Please enter a valid email address.');
                        return;
                    }

                    if (!phone) {
                        alert('Please enter your phone number.');
                        return;
                    }

                    const guests = [];
                    let daysAttending = [];

                    if (isAttending) {
                        const guestItems = document.querySelectorAll('.guest-item');
                        guestItems.forEach(item => {
                            const guestFirstName = item.querySelector('.guest-first-name').value;
                            const guestLastName = item.querySelector('.guest-last-name').value;
                            if (guestFirstName && guestLastName) {
                                guests.push({
                                    first_name: guestFirstName,
                                    last_name: guestLastName
                                });
                            }
                        });

                        const selectedDays = document.querySelectorAll('input[name="days"]:checked');
                        if (selectedDays.length === 0) {
                            document.getElementById('daysError').style.display = 'block';
                            return;
                        } else {
                            document.getElementById('daysError').style.display = 'none';
                        }

                        selectedDays.forEach(checkbox => {
                            daysAttending.push(checkbox.value);
                        });
                    }

                    const message = document.getElementById('message').value;
                    const rsvp_id = 'RSVP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

                    try {
                        const submitBtn = document.getElementById('submitBtn');
                        const originalText = submitBtn.textContent;
                        submitBtn.textContent = 'Sending Confirmation...';
                        submitBtn.disabled = true;
                        // Send to secure Express Backend API
                        const response = await fetch('/api/rsvp', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                first_name: first_name,
                                last_name: last_name,
                                email: email,
                                phone: phone,
                                is_attending: isAttending,
                                guests: guests,
                                days_attending: isAttending ? daysAttending : [],
                                message: message
                            })
                        });

                        const result = await response.json();

                        if (!response.ok) {
                            submitBtn.textContent = originalText;
                            submitBtn.disabled = false;

                            // Check if it's a Rate Limit error
                            if (response.status === 429) {
                                alert(result.error || 'Too many requests. Please try again later.');
                                return;
                            }
                            // Check if it's a Validation error
                            if (result.details) {
                                alert('Validation Error: ' + result.details.map(e => e.message).join(', '));
                                return;
                            }

                            throw new Error(result.error || 'Failed to submit RSVP');
                        }

                        // Use the sanitized ID generated securely by the backend
                        const final_rsvp_id = result.rsvp_id || rsvp_id;

                        if (isAttending) {
                            // Generate QR Code
                            document.getElementById('qrcode').innerHTML = '';
                            const qrcode = new QRCode(document.getElementById('qrcode'), {
                                text: final_rsvp_id,
                                width: 200,
                                height: 200,
                                colorDark: '#000000',
                                colorLight: '#ffffff',
                                correctLevel: QRCode.CorrectLevel.H
                            });
                            // Send email
                            const emailSent = await sendConfirmationEmail({
                                first_name,
                                last_name,
                                email,
                                rsvp_id: final_rsvp_id,
                                daysAttending,
                                guests,
                                phone,
                                message,
                                isAttending: true
                            });

                            // Show success
                            document.getElementById('successTitle').textContent = '🎉 Thank you for your RSVP!';
                            document.getElementById('rsvpIdDisplay').textContent = final_rsvp_id;
                            document.getElementById('successMessageText').textContent =
                                'Your RSVP has been confirmed. Please save your QR code below for check-in.';
                            document.getElementById('successMessage').style.display = 'block';
                            document.getElementById('qr-container').style.display = 'block';

                            if (emailSent) {
                                document.getElementById('emailStatusMessage').textContent =
                                    'A confirmation email with your QR code has been sent to your email address. Please save this QR code for check-in.';
                            } else {
                                document.getElementById('emailStatusMessage').innerHTML =
                                    '<strong>Please save your QR code below for check-in.</strong> Email delivery issue - but your RSVP is confirmed!';
                            }
                        } else {
                            // Not attending
                            document.getElementById('successTitle').textContent = 'Thank You for Your Response';
                            document.getElementById('rsvpIdDisplay').textContent = final_rsvp_id;
                            document.getElementById('successMessageText').textContent =
                                'Thank you for letting us know. We\'re sorry you can\'t make it, but we appreciate you taking the time to respond.';
                            document.getElementById('successMessage').style.display = 'block';
                            document.getElementById('qr-container').style.display = 'none';

                            showEmailStatus('success', 'Your response has been recorded. No email will be sent.');
                        }

                        rsvpForm.style.display = 'none';
                        document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });

                    } catch (error) {
                        console.error('Error saving to Firebase:', error);
                        alert('There was an error saving your RSVP. Please try again.');
                        showEmailStatus('error', 'RSVP failed. Please try again.');
                    } finally {
                        const submitBtn = document.getElementById('submitBtn');
                        if (submitBtn) {
                            submitBtn.textContent = 'Submit RSVP';
                            submitBtn.disabled = false;
                        }
                    }
                });
            }
        }

        // New RSVP function
        function newRSVP() {
            document.getElementById('successMessage').style.display = 'none';
            document.getElementById('qr-container').style.display = 'none';
            document.getElementById('wedding-rsvp').style.display = 'block';
            document.getElementById('wedding-rsvp').reset();
            document.getElementById('guests-container').innerHTML = '';

            // Reset attendance
            document.getElementById('attending-yes').checked = true;
            document.getElementById('attending-no').checked = false;
            document.getElementById('events-section').style.display = 'block';

            // Hide error messages
            document.getElementById('daysError').style.display = 'none';

            // Hide email status
            showEmailStatus('none', '');

            document.getElementById('rsvp').scrollIntoView({ behavior: 'smooth' });
        }

        // Setup real-time sync for RSVP settings
        function setupWebsiteRealtimeSync() {
            try {
                if (!firestoreDb) return;

                const unsub = onSnapshot(doc(firestoreDb, "settings", "admin"), (docSnap) => {
                    console.log('Website: Settings changed:', docSnap.data());
                    if (docSnap.exists()) {
                        const newData = docSnap.data();
                        // Only update if something actually changed to prevent infinite loops
                        if (rsvpSettings.enabled !== newData.rsvp_enabled ||
                            rsvpSettings.disabledMessage !== newData.disabled_message) {

                            // Update local settings
                            rsvpSettings.enabled = newData.rsvp_enabled;
                            rsvpSettings.disabledMessage = newData.disabled_message;

                            // Update localStorage
                            localStorage.setItem('weddingRSVPSettings', JSON.stringify(rsvpSettings));

                            // Show notification
                            showNotification('RSVP settings have been updated. Refreshing page...');

                            // Reload RSVP section after 3 seconds
                            setTimeout(() => {
                                checkRSVPStatus();
                            }, 3000);
                        }
                    }
                });

                console.log('Website settings subscription started');


            } catch (error) {
                console.error('Website real-time sync error:', error);
            }
        }

        // Initialize Firebase checks
        function initializeFirebase() {
            if (window.db) {
                console.log('Firebase client initialized successfully');
                return true;
            }
            return false;
        }

        // Slideshow functionality
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');

        function showSlide(n) {
            slides.forEach(slide => slide.classList.remove('active'));
            currentSlide = (n + slides.length) % slides.length;
            slides[currentSlide].classList.add('active');
        }

        function nextSlide() {
            showSlide(currentSlide + 1);
        }

        setInterval(nextSlide, 5000);

        // Mobile navigation toggle
        const hamburger = document.getElementById('hamburger');
        const navLinks = document.getElementById('nav-links');

        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = hamburger.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.className = 'fas fa-times';
            } else {
                icon.className = 'fas fa-bars';
            }
        });

        // Close mobile menu when clicking on a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger.querySelector('i').className = 'fas fa-bars';
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                hamburger.querySelector('i').className = 'fas fa-bars';
            }
        });

        // Tab functionality
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });

        // Smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 100,
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Header scroll effect
        window.addEventListener('scroll', () => {
            const header = document.querySelector('header');
            if (window.scrollY > 100) {
                header.style.padding = '10px 0';
                header.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)';
            } else {
                header.style.padding = '20px 0';
                header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            }
        });

        // Scroll Animation Observer
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target); // Only animate once
                }
            });
        }, observerOptions);

        // Initialize everything when DOM is loaded
        document.addEventListener('DOMContentLoaded', function () {
            // Apply observer to all animate-on-scroll elements
            document.querySelectorAll('.animate-on-scroll').forEach((el) => {
                observer.observe(el);
            });
            // Check Firebase initialization after a small delay to ensure module loaded
            setTimeout(() => {
                if (!initializeFirebase()) {
                    console.error('Failed to initialize Firebase');
                    // Try again after 1 second
                    setTimeout(() => {
                        if (!initializeFirebase()) {
                            console.error('Connection error. Firebase failed to load.');
                        } else {
                            checkRSVPStatus();
                            setupWebsiteRealtimeSync();
                        }
                    }, 1000);
                } else {
                    // Check RSVP status
                    checkRSVPStatus();

                    // Setup real-time sync
                    setupWebsiteRealtimeSync();
                }
            }, 500);

            // Initialize countdown
            initializeCountdown();


        });

(function () {
            const canvas = document.getElementById('bokeh-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            const PARTICLE_COUNT = 80;
            let particles = [];
            let animFrame;

            function resize() {
                const hero = canvas.parentElement;
                canvas.width = hero.offsetWidth;
                canvas.height = hero.offsetHeight;
            }

            function randomBetween(a, b) {
                return a + Math.random() * (b - a);
            }

            // Warm gold / soft white palette matching the wedding theme
            const COLORS = [
                'rgba(255, 255, 255, {a})',
                'rgba(255, 245, 200, {a})',
                'rgba(212, 175, 55, {a})',
                'rgba(255, 230, 150, {a})',
                'rgba(255, 255, 220, {a})',
            ];

            function createParticle(fromBottom = false) {
                const r = randomBetween(3, 16);
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                const alpha = randomBetween(0.15, 0.75);
                return {
                    x: randomBetween(r, canvas.width - r),
                    y: fromBottom ? canvas.height + r * 2 : randomBetween(0, canvas.height),
                    r: r,
                    color: color.replace('{a}', alpha.toFixed(2)),
                    colorBase: color,
                    alpha: alpha,
                    speedY: randomBetween(0.3, 1.1),
                    speedX: randomBetween(-0.3, 0.3),
                    sway: randomBetween(0.2, 0.8),
                    swayOffset: Math.random() * Math.PI * 2,
                    swaySpeed: randomBetween(0.008, 0.025),
                    t: 0,
                    blur: randomBetween(0, 4),
                };
            }

            function init() {
                resize();
                particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(false));
            }

            function drawParticle(p) {
                ctx.save();
                if (p.blur > 0) {
                    ctx.filter = `blur(${p.blur.toFixed(1)}px)`;
                }
                // Soft glowing circle — radial gradient for bokeh look
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                grad.addColorStop(0, p.colorBase.replace('{a}', p.alpha.toFixed(2)));
                grad.addColorStop(0.5, p.colorBase.replace('{a}', (p.alpha * 0.6).toFixed(2)));
                grad.addColorStop(1, p.colorBase.replace('{a}', '0'));
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();
            }

            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                particles.forEach((p, i) => {
                    p.t += 1;
                    p.y -= p.speedY;
                    p.x += Math.sin(p.swayOffset + p.t * p.swaySpeed) * p.sway;
                    drawParticle(p);

                    // Respawn if drifted above the top
                    if (p.y + p.r < 0) {
                        particles[i] = createParticle(true);
                    }
                });
                animFrame = requestAnimationFrame(animate);
            }

            // Pause when hero is not visible (performance)
            const heroSection = canvas.parentElement;
            const observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) {
                    if (!animFrame) animate();
                } else {
                    cancelAnimationFrame(animFrame);
                    animFrame = null;
                }
            }, { threshold: 0.1 });
            observer.observe(heroSection);

            window.addEventListener('resize', () => {
                resize();
                particles.forEach(p => {
                    p.x = Math.min(p.x, canvas.width - p.r);
                });
            });

            init();
            animate();
        })();

(function () {
            const canvas = document.getElementById('circles-canvas');
            const ctx = canvas.getContext('2d');
            let W, H, circles, raf;

            const isMobile = () => window.innerWidth < 768;

            // Palette: soft rose/blush tones matching the wedding theme
            const PALETTE = [
                'rgba(210,100,100,',
                'rgba(200,120,120,',
                'rgba(180,90,110,',
                'rgba(212,175,55,',   // gold accent
                'rgba(160,80,100,',
            ];

            function rand(a, b) { return a + Math.random() * (b - a); }

            function buildCircles() {
                circles = [];
                const mobile = isMobile();

                // ---------- LARGE OUTLINE RINGS ----------
                const ringCount = mobile ? 4 : 7;
                const ringMinR = mobile ? 35 : 60;
                const ringMaxR = mobile ? 70 : 130;
                const ringSpeed = mobile ? 0.4 : 0.3; /* Slower rings */

                for (let i = 0; i < ringCount; i++) {
                    circles.push(spawnCircle(ringMinR, ringMaxR, ringSpeed, 'ring'));
                }

                // ---------- TINY SOLID DOTS ----------
                const dotCount = mobile ? 10 : 18;
                const dotMinR = mobile ? 3 : 4;
                const dotMaxR = mobile ? 7 : 10;
                const dotSpeed = mobile ? 0.6 : 0.5; /* Slower dots */

                for (let i = 0; i < dotCount; i++) {
                    circles.push(spawnCircle(dotMinR, dotMaxR, dotSpeed, 'dot'));
                }
            }

            function spawnCircle(minR, maxR, baseSpeed, type) {
                const r = rand(minR, maxR);
                const angle = rand(0, Math.PI * 2);
                const speed = rand(baseSpeed * 0.8, baseSpeed * 1.4);
                const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
                const alpha = type === 'ring' ? rand(0.10, 0.22) : rand(0.22, 0.42);
                return {
                    x: rand(r, W - r),
                    y: rand(r, H - r),
                    r,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    type,
                    col,
                    alpha,
                    lineW: rand(1.0, 2.0)
                };
            }

            function resize() {
                W = canvas.width = window.innerWidth;
                H = canvas.height = window.innerHeight;
            }

            function separateCircles() {
                // Push overlapping circles apart so they never touch
                for (let i = 0; i < circles.length; i++) {
                    for (let j = i + 1; j < circles.length; j++) {
                        const a = circles[i], b = circles[j];
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const minD = a.r + b.r + 2;          // 2 px gap

                        if (dist < minD && dist > 0) {
                            // Elastic-like velocity exchange on the collision axis
                            const nx = dx / dist;
                            const ny = dy / dist;
                            const overlap = (minD - dist) / 2;

                            // Separate positions
                            a.x -= nx * overlap;
                            a.y -= ny * overlap;
                            b.x += nx * overlap;
                            b.y += ny * overlap;

                            // Reflect velocities along collision normal
                            const relVx = a.vx - b.vx;
                            const relVy = a.vy - b.vy;
                            const dot = relVx * nx + relVy * ny;

                            if (dot > 0) {
                                a.vx -= dot * nx;
                                a.vy -= dot * ny;
                                b.vx += dot * nx;
                                b.vy += dot * ny;
                            }
                        }
                    }
                }
            }

            function update() {
                for (const c of circles) {
                    c.x += c.vx;
                    c.y += c.vy;

                    // Bounce off walls
                    if (c.x - c.r < 0) { c.x = c.r; c.vx = Math.abs(c.vx); }
                    if (c.x + c.r > W) { c.x = W - c.r; c.vx = -Math.abs(c.vx); }
                    if (c.y - c.r < 0) { c.y = c.r; c.vy = Math.abs(c.vy); }
                    if (c.y + c.r > H) { c.y = H - c.r; c.vy = -Math.abs(c.vy); }
                }
                separateCircles();
            }

            function draw() {
                ctx.clearRect(0, 0, W, H);
                for (const c of circles) {
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                    if (c.type === 'ring') {
                        ctx.strokeStyle = c.col + c.alpha + ')';
                        ctx.lineWidth = c.lineW;
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = c.col + c.alpha + ')';
                        ctx.fill();
                    }
                }
            }

            function loop() {
                update();
                draw();
                raf = requestAnimationFrame(loop);
            }

            function init() {
                resize();
                buildCircles();
                if (raf) cancelAnimationFrame(raf);
                loop();
            }

            window.addEventListener('resize', () => {
                resize();
                buildCircles(); // Rebuild with correct sizes for new viewport
            });

            init();
        })();