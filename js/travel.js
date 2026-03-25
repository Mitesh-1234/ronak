        document.getElementById('hamburger').addEventListener('click', function () {
            document.getElementById('nav-links').classList.toggle('active');
        });

        // Use location.replace for nav links so mobile back button skips the travel page
        document.querySelectorAll('.nav-links a, .logo').forEach(link => {
            link.addEventListener('click', function (e) {
                const target = this.getAttribute('href');
                if (target && target.startsWith('index.html')) {
                    e.preventDefault();
                    window.location.replace(target);
                }
            });
        });

        // Scroll Animation Observer for travel page elements
        document.addEventListener('DOMContentLoaded', function () {
            const observerOptions = {
                root: null,
                rootMargin: '0px',
                threshold: 0.15
            };

            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, observerOptions);

            const fadeElements = document.querySelectorAll('.fade-in-up');
            fadeElements.forEach(el => observer.observe(el));
        });

        // ===== PARALLAX HERO =====
        (function () {
            const bg = document.getElementById('travelParallaxBg');
            if (!bg) return;
            function onScroll() {
                const scrollY = window.scrollY;
                // Move bg at 10% of scroll speed for parallax depth (more subtle)
                bg.style.transform = 'translateY(' + (scrollY * 0.1) + 'px)';
            }
            window.addEventListener('scroll', onScroll, { passive: true });
            onScroll();
        })();

        // ===== PHYSICS CIRCLE ANIMATION (same as main page) =====
        (function () {
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
            document.body.insertBefore(canvas, document.body.firstChild);
            const ctx = canvas.getContext('2d');
            let W, H, circles, raf;
            const isMobile = () => window.innerWidth < 768;
            const PALETTE = [
                'rgba(210,100,100,', 'rgba(200,120,120,', 'rgba(180,90,110,',
                'rgba(212,175,55,', 'rgba(160,80,100,'
            ];
            function rand(a, b) { return a + Math.random() * (b - a); }
            function buildCircles() {
                circles = [];
                const mobile = isMobile();
                const ringCount = mobile ? 3 : 5, ringMinR = mobile ? 30 : 50, ringMaxR = mobile ? 60 : 110, ringSpeed = 0.15;
                for (let i = 0; i < ringCount; i++) circles.push(spawn(ringMinR, ringMaxR, ringSpeed, 'ring'));
                const dotCount = mobile ? 8 : 14, dotMinR = mobile ? 3 : 4, dotMaxR = mobile ? 6 : 9, dotSpeed = 0.25;
                for (let i = 0; i < dotCount; i++) circles.push(spawn(dotMinR, dotMaxR, dotSpeed, 'dot'));
            }
            function spawn(minR, maxR, baseSpeed, type) {
                const r = rand(minR, maxR), angle = rand(0, Math.PI * 2), speed = rand(baseSpeed * 0.8, baseSpeed * 1.4);
                const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
                const alpha = type === 'ring' ? rand(0.08, 0.18) : rand(0.18, 0.36);
                return { x: rand(r, W - r), y: rand(r, H - r), r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, type, col, alpha, lineW: rand(1.0, 1.8) };
            }
            function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
            function separate() {
                for (let i = 0; i < circles.length; i++) {
                    for (let j = i + 1; j < circles.length; j++) {
                        const a = circles[i], b = circles[j];
                        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy), minD = a.r + b.r + 2;
                        if (dist < minD && dist > 0) {
                            const nx = dx / dist, ny = dy / dist, ov = (minD - dist) / 2;
                            a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
                            const rvx = a.vx - b.vx, rvy = a.vy - b.vy, dot = rvx * nx + rvy * ny;
                            if (dot > 0) { a.vx -= dot * nx; a.vy -= dot * ny; b.vx += dot * nx; b.vy += dot * ny; }
                        }
                    }
                }
            }
            function loop() {
                for (const c of circles) {
                    c.x += c.vx; c.y += c.vy;
                    if (c.x - c.r < 0) { c.x = c.r; c.vx = Math.abs(c.vx); }
                    if (c.x + c.r > W) { c.x = W - c.r; c.vx = -Math.abs(c.vx); }
                    if (c.y - c.r < 0) { c.y = c.r; c.vy = Math.abs(c.vy); }
                    if (c.y + c.r > H) { c.y = H - c.r; c.vy = -Math.abs(c.vy); }
                }
                separate();
                ctx.clearRect(0, 0, W, H);
                for (const c of circles) {
                    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                    if (c.type === 'ring') { ctx.strokeStyle = c.col + c.alpha + ')'; ctx.lineWidth = c.lineW; ctx.stroke(); }
                    else { ctx.fillStyle = c.col + c.alpha + ')'; ctx.fill(); }
                }
                raf = requestAnimationFrame(loop);
            }
            function init() { resize(); buildCircles(); if (raf) cancelAnimationFrame(raf); loop(); }
            window.addEventListener('resize', () => { resize(); buildCircles(); });
            init();
        })();
