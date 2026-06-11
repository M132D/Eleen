class HandyFlix {
    constructor() {
        // Use local API (built-in API integrated in server.js)
        this.baseURL = '';
        this.currentMovie = null;
        this.currentHeroIndex = 0;
        this.heroMovies = [];
        this.continueWatching = JSON.parse(localStorage.getItem('continueWatching')) || [];
        this.trailerPlaying = false;
        this.lastHeroUpdate = localStorage.getItem('lastHeroUpdate');
        this.currentVideoTime = 0;
        
        // Plyr Player Instance
        this.player = null;
        
        // Custom Player State (for compatibility)
        this.isPlaying = false;
        this.isFullscreen = false;
        this.isMiniplayer = false;
        this.isLocked = false;
        this.controlsTimeout = null;
        this.loadingTimeout = null;
        this.controlsVisible = true;
        this.currentPlaybackSpeed = 1;
        this.currentQuality = 'auto';
        
        this.init();
    }

    init() {
        // For player page, initialize immediately without delay
        if (window.location.pathname === '/player') {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            this.setupEventListeners();
            this.initPlyrPlayer();
            return;
        }
        
        // For other pages, load content immediately with a minimum display time for loading screen
        const minLoadingTime = 1500; // Minimum 1.5 seconds for smooth UX
        const startTime = Date.now();
        
        this.setupEventListeners();
        this.loadHomepageContent().then(() => {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
            
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
                this.startHeroRotation();
            }, remainingTime);
        }).catch(() => {
            // Even on error, hide loading screen after minimum time
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
            
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
            }, remainingTime);
        });
    }

    setupEventListeners() {
        const searchToggle = document.getElementById('search-toggle');
        if (searchToggle) {
            searchToggle.addEventListener('click', () => {
                window.location.href = '/search';
            });
        }

        // Genre filtering with backend logic
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                const category = tab.dataset.category;
                
                // Update active state
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Load and filter content
                await this.loadAndFilterContent(category);
            });
        });

        const heroPlayBtn = document.getElementById('hero-play-btn');
        if (heroPlayBtn) {
            heroPlayBtn.addEventListener('click', () => {
                if (this.heroMovies.length > 0) {
                    const currentHeroMovie = this.heroMovies[this.currentHeroIndex];
                    window.location.href = `/details?id=${currentHeroMovie.subjectId}`;
                }
            });
        }

        const heroInfoBtn = document.getElementById('hero-info-btn');
        if (heroInfoBtn) {
            heroInfoBtn.addEventListener('click', () => {
                if (this.heroMovies.length > 0) {
                    const currentHeroMovie = this.heroMovies[this.currentHeroIndex];
                    window.location.href = `/details?id=${currentHeroMovie.subjectId}`;
                }
            });
        }

        const playerVideo = document.getElementById('player-video');
        if (playerVideo) {
            playerVideo.addEventListener('timeupdate', () => {
                this.currentVideoTime = playerVideo.currentTime;
                if (this.currentMovie) {
                    this.updateContinueWatchingProgress(this.currentMovie.subjectId, playerVideo.currentTime, playerVideo.duration);
                }
            });

            playerVideo.addEventListener('ended', () => {
                if (this.currentMovie) {
                    this.removeFromContinueWatching(this.currentMovie.subjectId);
                }
            });
        }
    }

    // Plyr Player Functions
    initPlyrPlayer() {
        const videoElement = document.getElementById('player-video');
        
        if (!videoElement) return;
        
        // Initialize Plyr with custom options
        this.player = new Plyr(videoElement, {
            controls: [
                'play-large',
                'rewind',
                'play',
                'fast-forward',
                'progress',
                'current-time',
                'duration',
                'mute',
                'volume',
                'settings',
                'pip',
                'airplay',
                'fullscreen'
            ],
            settings: ['quality', 'speed'],
            speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
            seekTime: 10, // Forward button will seek 10s
            rewind: { seekTime: 15 }, // Rewind button will seek 15s back
            quality: {
                default: 480,
                options: [360, 480, 720, 1080],
                forced: true,
                onChange: (quality) => {
                    console.log('Quality changed to:', quality);
                }
            },
            i18n: {
                qualityLabel: {
                    360: '360p',
                    480: '480p',
                    720: '720p (HD)',
                    1080: '1080p (Full HD)'
                },
                rewind: 'Rewind {seektime}s',
                fastForward: 'Forward {seektime}s'
            },
            autoplay: false,
            keyboard: { focused: true, global: true },
            tooltips: { controls: true, seek: true },
            fullscreen: { enabled: true, fallback: true, iosNative: true }
        });
        
        // Setup Plyr event listeners
        this.setupPlyrEvents();
        
        // Setup screen orientation lock for mobile
        this.setupScreenOrientation();
    }
    
    setupScreenOrientation() {
        if (!this.player) return;
        
        // Auto-rotate to landscape on mobile when player loads
        if (this.isMobile() && screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(err => {
                console.log('Screen orientation lock on load not supported:', err);
            });
        }
        
        // Lock screen to landscape when entering fullscreen on mobile
        this.player.on('enterfullscreen', () => {
            if (this.isMobile()) {
                // Try to lock to landscape
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(err => {
                        console.log('Screen orientation lock not supported:', err);
                    });
                }
            }
        });
        
        this.player.on('exitfullscreen', () => {
            // Unlock orientation when exiting fullscreen
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        });
    }
    
    setupPlyrEvents() {
        if (!this.player) return;
        
        const loadingOverlay = document.getElementById('plyr-loading-overlay');
        
        // Show loading spinner
        const showLoading = () => {
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
            }
        };
        
        // Hide loading spinner
        const hideLoading = () => {
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        };
        
        // Show loading when video is loading
        this.player.on('waiting', () => {
            console.log('Plyr: Buffering...');
            showLoading();
        });
        
        this.player.on('loadstart', () => {
            console.log('Plyr: Loading start');
            showLoading();
        });
        
        // Hide loading when video is ready to play
        this.player.on('canplay', () => {
            console.log('Plyr: Can play');
            hideLoading();
        });
        
        this.player.on('playing', () => {
            console.log('Plyr: Playing');
            hideLoading();
        });
        
        // Track playback state
        this.player.on('play', () => {
            this.isPlaying = true;
            console.log('Plyr: Video playing');
            
            // Save progress for continue watching
            if (this.currentMovie) {
                this.updateContinueWatchingProgress(
                    this.currentMovie.subjectId, 
                    this.player.currentTime, 
                    this.player.duration
                );
            }
        });
        
        this.player.on('pause', () => {
            this.isPlaying = false;
            console.log('Plyr: Video paused');
        });
        
        this.player.on('timeupdate', () => {
            this.currentVideoTime = this.player.currentTime;
            
            // Save progress periodically
            if (this.currentMovie) {
                this.updateContinueWatchingProgress(
                    this.currentMovie.subjectId, 
                    this.player.currentTime, 
                    this.player.duration
                );
            }
        });
        
        this.player.on('ended', () => {
            console.log('Plyr: Video ended');
            this.isPlaying = false;
            
            // Remove from continue watching when finished
            if (this.currentMovie) {
                this.removeFromContinueWatching(this.currentMovie.subjectId);
            }
        });
        
        this.player.on('enterfullscreen', () => {
            this.isFullscreen = true;
            console.log('Plyr: Fullscreen entered');
        });
        
        this.player.on('exitfullscreen', () => {
            this.isFullscreen = false;
            console.log('Plyr: Fullscreen exited');
        });
        
        this.player.on('ready', () => {
            console.log('Plyr: Player ready');
            const loadingOverlay = document.getElementById('plyr-loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        });
        
        this.player.on('error', (event) => {
            console.error('Plyr: Error', event);
            const loadingOverlay = document.getElementById('plyr-loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        });
        
        this.player.on('qualitychange', (event) => {
            const newQuality = event.detail.quality;
            console.log('Plyr: Quality changed to', newQuality);
            
            // Get current time and playing state
            const currentTime = this.player.currentTime;
            const wasPlaying = !this.player.paused;
            
            // Get all available sources
            const allSources = this.player.source.sources;
            
            // Find the source that matches the selected quality
            const selectedSource = allSources.find(source => source.size === parseInt(newQuality));
            
            if (selectedSource) {
                console.log('Switching to quality:', selectedSource.size, 'URL:', selectedSource.src);
                
                // Update to the new source
                this.player.source = {
                    type: 'video',
                    sources: allSources, // Keep all sources available
                    poster: this.player.poster
                };
                
                // Set the quality after source update
                this.player.quality = parseInt(newQuality);
                
                // When the video is ready, restore playback position
                const restorePlayback = () => {
                    this.player.currentTime = currentTime;
                    if (wasPlaying) {
                        this.player.play().catch(err => {
                            console.log('Auto-play after quality change prevented:', err);
                        });
                    }
                    this.player.off('loadeddata', restorePlayback);
                };
                
                this.player.on('loadeddata', restorePlayback);
            }
        });
        
        this.player.on('ratechange', () => {
            console.log('Plyr: Playback rate changed to', this.player.speed);
        });
    }

    // Custom Player Functions (Legacy - kept for compatibility)
    initCustomPlayer() {
        this.setupCustomPlayerEvents();
        this.hideControlsAfterTimeout();
        this.setupOrientationHandling();
    }
    
    setupOrientationHandling() {
        // Handle orientation changes
        const handleOrientationChange = () => {
            if (this.isMobile() && this.isPlaying) {
                const orientation = screen.orientation || window.orientation;
                
                // If landscape mode and video is playing, ensure fullscreen
                if ((orientation && orientation.type && orientation.type.includes('landscape')) || 
                    window.orientation === 90 || window.orientation === -90) {
                    if (!this.isFullscreen) {
                        this.enterFullscreen();
                    }
                }
            }
        };
        
        // Listen for orientation changes
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        } else {
            window.addEventListener('orientationchange', handleOrientationChange);
        }
        
        // Handle fullscreen change events
        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen = !!document.fullscreenElement;
            this.updateFullscreenButton();
        });
        
        document.addEventListener('webkitfullscreenchange', () => {
            this.isFullscreen = !!document.webkitFullscreenElement;
            this.updateFullscreenButton();
        });
        
        document.addEventListener('mozfullscreenchange', () => {
            this.isFullscreen = !!document.mozFullScreenElement;
            this.updateFullscreenButton();
        });
    }

    setupCustomPlayerEvents() {
        const video = document.getElementById('player-video');
        const customPlayer = document.getElementById('custom-video-player');
        const tapZoneLeft = document.getElementById('tap-zone-left');
        const tapZoneRight = document.getElementById('tap-zone-right');
        const tapFeedbackLeft = document.getElementById('tap-feedback-left');
        const tapFeedbackRight = document.getElementById('tap-feedback-right');

        // Triple tap counter for skip forward/backward
        let tapCount = 0;
        let tapTimer = null;
        let lastTapTime = 0;

        // Tap gesture handling for skip controls
        if (tapZoneLeft) {
            tapZoneLeft.addEventListener('click', (e) => {
                e.stopPropagation();
                const now = Date.now();
                
                // Reset if more than 500ms since last tap
                if (now - lastTapTime > 500) {
                    tapCount = 0;
                }
                
                tapCount++;
                lastTapTime = now;
                
                // Clear previous timer
                if (tapTimer) clearTimeout(tapTimer);
                
                // Wait for more taps or execute
                tapTimer = setTimeout(() => {
                    if (tapCount >= 3) {
                        // Skip backward 10 seconds on triple tap
                        this.rewind(10);
                        this.showTapFeedback(tapFeedbackLeft);
                    }
                    tapCount = 0;
                }, 300);
            });
        }

        if (tapZoneRight) {
            tapZoneRight.addEventListener('click', (e) => {
                e.stopPropagation();
                const now = Date.now();
                
                // Reset if more than 500ms since last tap
                if (now - lastTapTime > 500) {
                    tapCount = 0;
                }
                
                tapCount++;
                lastTapTime = now;
                
                // Clear previous timer
                if (tapTimer) clearTimeout(tapTimer);
                
                // Wait for more taps or execute
                tapTimer = setTimeout(() => {
                    if (tapCount >= 3) {
                        // Skip forward 10 seconds on triple tap
                        this.forward(10);
                        this.showTapFeedback(tapFeedbackRight);
                    }
                    tapCount = 0;
                }, 300);
            });
        }

        video.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleControlsVisibility();
        });

        video.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });

        video.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            this.hideControlsAfterTimeout();
            
            // Auto-rotate to fullscreen on play (Netflix-style)
            if (!this.isFullscreen && this.isMobile()) {
                setTimeout(() => {
                    this.enterFullscreen();
                }, 300);
            }
        });

        video.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayPauseButton();
            this.showControls();
        });

        video.addEventListener('timeupdate', () => {
            // Use requestAnimationFrame for smoother updates
            requestAnimationFrame(() => {
                this.updateProgressBar();
                this.updateTimeDisplays();
            });
        });

        video.addEventListener('loadedmetadata', () => {
            this.updateTimeDisplays();
            this.updateProgressBar();
            this.hidePlayerLoading();
        });

        video.addEventListener('waiting', () => {
            // Debounce loading indicator to avoid flicker
            if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
            this.loadingTimeout = setTimeout(() => {
                this.showPlayerLoading();
            }, 200);
        });

        video.addEventListener('canplay', () => {
            if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
            this.hidePlayerLoading();
        });

        video.addEventListener('playing', () => {
            if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
            this.hidePlayerLoading();
        });

        customPlayer.addEventListener('mousemove', () => {
            if (!this.isLocked) {
                this.showControls();
                this.hideControlsAfterTimeout();
            }
        });

        customPlayer.addEventListener('touchstart', () => {
            if (!this.isLocked) {
                this.showControls();
                this.hideControlsAfterTimeout();
            }
        });

        document.getElementById('back-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.history.back();
        });

        document.getElementById('play-pause-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlayPause();
        });

        document.getElementById('rewind-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.rewind(10);
        });

        document.getElementById('forward-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.forward(10);
        });

        document.getElementById('fullscreen-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });

        document.getElementById('screenshot-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.takeScreenshot();
        });

        document.getElementById('volume-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMute();
        });

        document.getElementById('lock-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLock();
        });

        document.getElementById('miniplayer-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMiniplayer();
        });

        document.getElementById('settings-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSettingsMenu();
        });

        const progressBar = document.getElementById('progress-bar');
        progressBar.addEventListener('click', (e) => {
            e.stopPropagation();
            this.seekToPosition(e);
        });

        progressBar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startSeeking(e);
        });

        progressBar.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            this.startSeeking(e);
        });

        this.setupSettingsMenu();

        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen = !!document.fullscreenElement;
            this.updateFullscreenButton();
        });

        document.addEventListener('keydown', (e) => {
            if (!this.isLocked) {
                this.handleKeyboardShortcuts(e);
            }
        });

        document.addEventListener('click', (e) => {
            const settingsMenu = document.getElementById('settings-menu');
            if (settingsMenu && !settingsMenu.contains(e.target) && 
                !document.getElementById('settings-btn').contains(e.target)) {
                settingsMenu.classList.remove('active');
            }
        });
    }

    setupSettingsMenu() {
        document.getElementById('quality-option').addEventListener('click', (e) => {
            e.stopPropagation();
            const submenu = document.getElementById('quality-submenu');
            submenu.classList.toggle('active');
            document.getElementById('speed-submenu').classList.remove('active');
        });

        document.getElementById('speed-option').addEventListener('click', (e) => {
            e.stopPropagation();
            const submenu = document.getElementById('speed-submenu');
            submenu.classList.toggle('active');
            document.getElementById('quality-submenu').classList.remove('active');
        });

        document.querySelectorAll('#quality-submenu .settings-suboption').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const quality = option.dataset.quality;
                this.changeQuality(quality);
                document.querySelectorAll('#quality-submenu .settings-suboption').forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
                document.getElementById('quality-submenu').classList.remove('active');
            });
        });

        document.querySelectorAll('#speed-submenu .settings-suboption').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(option.dataset.speed);
                this.changePlaybackSpeed(speed);
                document.querySelectorAll('#speed-submenu .settings-suboption').forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
                document.getElementById('speed-submenu').classList.remove('active');
            });
        });
    }

    togglePlayPause() {
        const video = document.getElementById('player-video');
        if (this.isPlaying) {
            video.pause();
        } else {
            video.play();
            // Auto-enter fullscreen on play if not already in fullscreen
            if (!this.isFullscreen && this.isMobile()) {
                setTimeout(() => {
                    this.enterFullscreen();
                }, 100);
            }
        }
    }

    rewind(seconds) {
        const video = document.getElementById('player-video');
        video.currentTime = Math.max(0, video.currentTime - seconds);
        this.showControls();
    }

    forward(seconds) {
        const video = document.getElementById('player-video');
        video.currentTime = Math.min(video.duration, video.currentTime + seconds);
        this.showControls();
    }

    toggleFullscreen() {
        const customPlayer = document.getElementById('custom-video-player');
        
        if (!this.isFullscreen) {
            this.enterFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
        
        this.showControls();
    }

    enterFullscreen() {
        const customPlayer = document.getElementById('custom-video-player');
        const video = document.getElementById('player-video');
        
        // For mobile devices, try video element fullscreen first for better compatibility
        if (this.isMobile() && video) {
            // iOS Safari specific handling
            if (video.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
                return;
            }
            // Other mobile browsers
            if (video.requestFullscreen) {
                video.requestFullscreen().catch(() => {
                    // Fallback to container fullscreen
                    this.requestContainerFullscreen(customPlayer);
                });
                return;
            }
        }
        
        // Desktop or fallback to container fullscreen
        this.requestContainerFullscreen(customPlayer);
        
        // Try to lock orientation to landscape for mobile
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {
                // Ignore errors, not all devices support this
            });
        }
    }
    
    requestContainerFullscreen(element) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    showTapFeedback(feedbackElement) {
        if (!feedbackElement) return;
        
        feedbackElement.classList.add('show');
        setTimeout(() => {
            feedbackElement.classList.remove('show');
        }, 600);
    }

    toggleControlsVisibility() {
        const overlay = document.getElementById('player-overlay');
        if (overlay.classList.contains('active')) {
            this.hideControls();
        } else {
            this.showControls();
            this.hideControlsAfterTimeout();
        }
    }

    toggleMute() {
        const video = document.getElementById('player-video');
        const volumeBtn = document.getElementById('volume-btn');
        
        video.muted = !video.muted;
        
        if (video.muted) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            if (video.volume >= 0.5) {
                volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            } else if (video.volume > 0) {
                volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
            } else {
                volumeBtn.innerHTML = '<i class="fas fa-volume-off"></i>';
            }
        }
        
        this.showControls();
    }

    toggleLock() {
        this.isLocked = !this.isLocked;
        const lockBtn = document.getElementById('lock-btn');
        const overlay = document.getElementById('player-overlay');
        const lockIndicator = document.getElementById('lock-indicator');
        
        if (this.isLocked) {
            lockBtn.innerHTML = '<i class="fas fa-unlock"></i>';
            overlay.classList.add('locked');
            this.hideControls();
            lockIndicator.classList.add('show');
            setTimeout(() => {
                lockIndicator.classList.remove('show');
            }, 2000);
        } else {
            lockBtn.innerHTML = '<i class="fas fa-lock"></i>';
            overlay.classList.remove('locked');
            this.showControls();
        }
    }

    toggleMiniplayer() {
        this.showToast('Miniplayer feature coming soon!');
        this.showControls();
    }

    toggleSettingsMenu() {
        const settingsMenu = document.getElementById('settings-menu');
        settingsMenu.classList.toggle('active');
        this.showControls();
    }

    takeScreenshot() {
        const video = document.getElementById('player-video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screenshot-${new Date().getTime()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        
        this.showToast('Screenshot saved!');
        this.showControls();
    }

    changeQuality(quality) {
        this.currentQuality = quality;
        this.showToast(`Quality changed to ${quality}`);
        this.showControls();
    }

    changePlaybackSpeed(speed) {
        const video = document.getElementById('player-video');
        video.playbackRate = speed;
        this.currentPlaybackSpeed = speed;
        this.showToast(`Playback speed: ${speed}x`);
        this.showControls();
    }

    updateProgressBar() {
        const video = document.getElementById('player-video');
        const progressFilled = document.getElementById('progress-filled');
        const progressHandle = document.getElementById('progress-handle');
        
        if (video && video.duration && progressFilled && progressHandle) {
            const progress = (video.currentTime / video.duration) * 100;
            // Use transform for better performance instead of width
            progressFilled.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;
        }
    }

    updateTimeDisplays() {
        const video = document.getElementById('player-video');
        const currentTime = document.getElementById('current-time');
        const duration = document.getElementById('duration');
        
        if (video && video.duration && currentTime && duration) {
            // Use requestAnimationFrame for smoother updates
            requestAnimationFrame(() => {
                currentTime.textContent = this.formatTime(video.currentTime);
                duration.textContent = this.formatTime(video.duration);
            });
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    seekToPosition(e) {
        const video = document.getElementById('player-video');
        const progressBar = document.getElementById('progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        video.currentTime = percent * video.duration;
        this.showControls();
    }

    startSeeking(e) {
        e.preventDefault();
        const video = document.getElementById('player-video');
        const progressBar = document.getElementById('progress-bar');
        
        const seek = (moveEvent) => {
            const rect = progressBar.getBoundingClientRect();
            let percent = (moveEvent.clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            video.currentTime = percent * video.duration;
        };
        
        const stopSeeking = () => {
            document.removeEventListener('mousemove', seek);
            document.removeEventListener('mouseup', stopSeeking);
            document.removeEventListener('touchmove', seek);
            document.removeEventListener('touchend', stopSeeking);
        };
        
        document.addEventListener('mousemove', seek);
        document.addEventListener('mouseup', stopSeeking);
        document.addEventListener('touchmove', seek);
        document.addEventListener('touchend', stopSeeking);
        
        seek(e);
        this.showControls();
    }

    updatePlayPauseButton() {
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (this.isPlaying) {
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    updateFullscreenButton() {
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (this.isFullscreen) {
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    showControls() {
        if (this.isLocked) return;
        
        clearTimeout(this.controlsTimeout);
        const overlay = document.getElementById('player-overlay');
        overlay.classList.add('active');
        this.controlsVisible = true;
    }

    hideControls() {
        const overlay = document.getElementById('player-overlay');
        overlay.classList.remove('active');
        this.controlsVisible = false;
        const settingsMenu = document.getElementById('settings-menu');
        if (settingsMenu) {
            settingsMenu.classList.remove('active');
        }
    }

    hideControlsAfterTimeout() {
        if (this.isLocked) return;
        
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            if (this.isPlaying) {
                this.hideControls();
            }
        }, 3000);
    }

    handleKeyboardShortcuts(e) {
        switch(e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.rewind(5);
                break;
            case 'arrowright':
                e.preventDefault();
                this.forward(5);
                break;
            case 'l':
                e.preventDefault();
                this.toggleLock();
                break;
            case 'c':
                e.preventDefault();
                this.takeScreenshot();
                break;
        }
    }

    showPlayerLoading() {
        const loading = document.querySelector('.player-loading');
        if (loading) {
            loading.style.display = 'block';
        }
    }

    hidePlayerLoading() {
        const loading = document.querySelector('.player-loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    async loadHomepageContent(retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second between retries
        
        try {
            // Use the homepage API to get all content in one call
            const homepageData = await this.fetchHomepageData();
            
            if (!homepageData || !homepageData.operatingList) {
                throw new Error('Homepage API returned no data');
            }

            console.log('Homepage API returned categories:', homepageData.operatingList.map(c => c.title));

            // Map API categories to container IDs with flexible matching
            const categoryMapping = {
                'Trending Now🔥': 'top-trending',
                'Hollywood Movie': 'popular-movies',
                'Nollywood': 'nollywood-movies',
                'Latest Nollywood Movies': 'nollywood-movies',
                'C-Drama': 'chinese-movies',
                '💓Teen Romance 💓': 'romance-movies',
                'Anime[English Dubbed]': 'anime-movies',
                'New-English Dubbed Anime Series': 'anime-movies',
                'Horror Movies': 'horror-movies',
                'New Series': 'popular-series',
                'Animated Film': 'disney-movies',
                'Action Movies': 'marvel-movies',
                'Dwayne "The Rock" Johnson': 'marvel-movies',
                '🔔🎄Holiday Season': 'new-releases',
                'K-Drama': 'teen-movies',
                'Thai-Drama': 'teen-series'
            };

            // Process each category from the homepage API
            let categoriesProcessed = 0;
            for (const category of homepageData.operatingList) {
                if (category.type === 'SUBJECTS_MOVIE' && category.subjects && category.subjects.length > 0) {
                    const containerId = categoryMapping[category.title];
                    if (containerId) {
                        const container = document.getElementById(containerId);
                        if (container) {
                            container.innerHTML = this.createMovieCards(category.subjects.slice(0, 15));
                            categoriesProcessed++;
                            console.log(`Loaded ${category.subjects.length} items for "${category.title}" into #${containerId}`);
                        }
                    } else {
                        // Try to find a matching container by checking if category title contains keywords
                        const title = category.title.toLowerCase();
                        let matchedContainer = null;
                        
                        if (title.includes('anime')) matchedContainer = 'anime-movies';
                        else if (title.includes('nollywood')) matchedContainer = 'nollywood-movies';
                        else if (title.includes('chinese') || title.includes('c-drama')) matchedContainer = 'chinese-movies';
                        else if (title.includes('romance')) matchedContainer = 'romance-movies';
                        else if (title.includes('horror')) matchedContainer = 'horror-movies';
                        else if (title.includes('disney') || title.includes('animated')) matchedContainer = 'disney-movies';
                        else if (title.includes('action') || title.includes('rock') || title.includes('marvel')) matchedContainer = 'marvel-movies';
                        else if (title.includes('holiday') || title.includes('christmas') || title.includes('halloween')) matchedContainer = 'new-releases';
                        else if (title.includes('k-drama') || title.includes('korean')) matchedContainer = 'teen-movies';
                        else if (title.includes('thai') || title.includes('series')) matchedContainer = 'teen-series';
                        else if (title.includes('hollywood') || title.includes('movie')) matchedContainer = 'popular-movies';
                        
                        if (matchedContainer) {
                            const container = document.getElementById(matchedContainer);
                            if (container && !container.innerHTML.trim()) {
                                container.innerHTML = this.createMovieCards(category.subjects.slice(0, 15));
                                categoriesProcessed++;
                                console.log(`Auto-matched "${category.title}" to #${matchedContainer}`);
                            }
                        }
                    }
                }
            }

            console.log(`Processed ${categoriesProcessed} categories from API`);

            // Set hero movies from trending category
            const trendingCategory = homepageData.operatingList.find(
                cat => cat.title === 'Trending Now🔥' && cat.subjects && cat.subjects.length > 0
            );
            if (trendingCategory) {
                this.heroMovies = trendingCategory.subjects.slice(0, 10);
                this.updateHeroContent();
            }

            // Load continue watching section from localStorage
            this.loadContinueWatching();
            
            // Add click listeners to all movie cards
            this.addMovieCardListeners();
            
            console.log('Homepage content loaded successfully from homepage API');
        } catch (error) {
            console.error(`Error loading homepage content (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
            
            // Retry logic with exponential backoff
            if (retryCount < maxRetries) {
                const delay = Math.min(retryDelay * Math.pow(2, retryCount), 5000); // Cap at 5 seconds
                console.log(`Retrying in ${delay}ms...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.loadHomepageContent(retryCount + 1);
            }
            
            // After all retries failed, show error
            this.showHomepageError();
            throw error; // Re-throw to be caught by init()
        }
    }

    async fetchHomepageData() {
        // Quick retry strategy: 2 fast attempts with 1s delay
        // This handles temporary network glitches quickly
        // The outer loadHomepageContent has additional slower retries for persistent issues
        const maxAttempts = 2;
        let lastError = null;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
                
                const response = await fetch(`${this.baseURL}/api/homepage`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.status === 200 && data.success && data.data) {
                    return data.data;
                }
                
                throw new Error('Homepage API returned invalid data');
            } catch (error) {
                lastError = error;
                console.error(`Fetch attempt ${attempt + 1} failed:`, error.message);
                
                // Don't wait on the last attempt
                if (attempt < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        throw lastError || new Error('Failed to fetch homepage data');
    }

    showHomepageError() {
        // Show a more helpful error message with retry button
        const containers = [
            'top-trending', 'popular-movies', 'nollywood-movies', 'chinese-movies',
            'romance-movies', 'anime-movies', 'horror-movies', 'popular-series',
            'disney-movies', 'marvel-movies', 'new-releases', 'teen-movies', 'teen-series'
        ];
        
        const errorHTML = `
            <div style="text-align: center; padding: 20px; color: #999;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #e50914; margin-bottom: 15px;"></i>
                <p style="font-size: 16px; margin-bottom: 15px;">Unable to load content.</p>
                <button onclick="location.reload()" style="background: #e50914; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    <i class="fas fa-sync-alt"></i> Reload Page
                </button>
            </div>
        `;
        
        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                // Always show error, clearing any existing content
                container.innerHTML = errorHTML;
            }
        });
    }

    async loadHeroMovies() {
        // This is now handled in loadHomepageContent, but keep for compatibility
        if (this.heroMovies.length === 0) {
            try {
                const homepageData = await this.fetchHomepageData();
                if (homepageData && homepageData.operatingList) {
                    const trendingCategory = homepageData.operatingList.find(
                        cat => cat.title === 'Trending Now🔥' && cat.subjects && cat.subjects.length > 0
                    );
                    if (trendingCategory) {
                        this.heroMovies = trendingCategory.subjects.slice(0, 10);
                    }
                }
            } catch (error) {
                console.error('Error loading hero movies:', error);
            }
        }
    }

    startHeroRotation() {
        setInterval(() => {
            this.currentHeroIndex = (this.currentHeroIndex + 1) % this.heroMovies.length;
            this.updateHeroContent();
        }, 5000);
    }

    updateHeroContent() {
        if (this.heroMovies.length === 0) return;
        
        const movie = this.heroMovies[this.currentHeroIndex];
        const heroSection = document.getElementById('hero-section');
        const heroTitle = document.getElementById('hero-title');
        
        if (heroSection && heroTitle) {
            heroSection.style.backgroundImage = `url(${movie.cover?.url || movie.thumbnail})`;
            heroTitle.textContent = movie.title;
        }
    }

    async loadAndFilterContent(category) {
        const filteredSection = document.getElementById('filtered-content-section');
        const filteredTitle = document.getElementById('filtered-title');
        const filteredMovies = document.getElementById('filtered-movies');
        
        if (!filteredSection || !filteredTitle || !filteredMovies) return;

        // Show the filtered section
        filteredSection.style.display = 'block';
        
        // Update title based on category
        const categoryNames = {
            'all': 'All Movies & Series',
            'action': 'Action Movies & Series',
            'comedy': 'Comedy Movies & Series',
            'drama': 'Drama Movies & Series',
            'sci-fi': 'Sci-Fi Movies & Series',
            'horror': 'Horror Movies & Series',
            'anime': 'Anime Collection',
            'korean': 'Korean Drama Collection',
            'nollywood': 'Nollywood Movies',
            'bollywood': 'Bollywood Movies',
            'chinese': 'Chinese Movies & Series',
            'romance': 'Romance Movies & Series',
            'teen-movies': 'Teen Movies',
            'teen-series': 'Teen Series',
            'disney': 'Disney Collection',
            'marvel': 'Marvel Collection'
        };
        
        filteredTitle.innerHTML = `<i class="fas fa-filter"></i> ${categoryNames[category] || 'Filtered Content'}`;
        
        // Show loading
        filteredMovies.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        
        // Scroll to filtered section
        filteredSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Load content based on category
        if (category === 'all') {
            // Hide filtered section for "All"
            filteredSection.style.display = 'none';
        } else {
            let searchQuery = '';
            switch(category) {
                case 'action': searchQuery = 'action 2025'; break;
                case 'comedy': searchQuery = 'comedy 2025'; break;
                case 'drama': searchQuery = 'drama 2025'; break;
                case 'sci-fi': searchQuery = 'sci-fi 2025'; break;
                case 'horror': searchQuery = 'horror 2025'; break;
                case 'anime': searchQuery = 'anime 2025'; break;
                case 'korean': searchQuery = 'korean drama 2025'; break;
                case 'nollywood': searchQuery = 'nollywood 2025'; break;
                case 'bollywood': searchQuery = 'bollywood 2025'; break;
                case 'chinese': searchQuery = 'chinese 2025'; break;
                case 'romance': searchQuery = 'romance 2025'; break;
                case 'teen-movies': searchQuery = 'teen movies 2025'; break;
                case 'teen-series': searchQuery = 'teen series 2025'; break;
                case 'disney': searchQuery = 'disney 2025'; break;
                case 'marvel': searchQuery = 'marvel 2025'; break;
                default: searchQuery = '2025'; break;
            }

            const response = await this.searchMovies(searchQuery, 50);
            filteredMovies.innerHTML = this.createMovieCards(response.results.items);
            this.addMovieCardListeners();
        }
    }

    async searchMovies(query, limit = 50) {
        try {
            const response = await fetch(`${this.baseURL}/api/search/${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.status === 200 && data.success) {
                const filteredItems = data.results.items.filter(movie => {
                    const releaseYear = movie.releaseDate ? parseInt(movie.releaseDate.split('-')[0]) : 0;
                    return releaseYear >= 2020 && releaseYear <= 2025;
                });
                
                return {
                    ...data,
                    results: {
                        ...data.results,
                        items: filteredItems.slice(0, limit)
                    }
                };
            }
            throw new Error('Search failed');
        } catch (error) {
            console.error('Search error:', error);
            return { results: { items: [] } };
        }
    }

    async getMovieInfo(movieId) {
        try {
            const response = await fetch(`${this.baseURL}/api/info/${movieId}`);
            const data = await response.json();
            
            // Try to get French version if available
            if (data && data.success && data.results && data.results.subject) {
                const frenchVersion = await this.getFrenchVersion(data.results.subject.title, data.results.subject.subjectType);
                if (frenchVersion) {
                    // Return French version info instead
                    const frenchResponse = await fetch(`${this.baseURL}/api/info/${frenchVersion.subjectId}`);
                    const frenchData = await frenchResponse.json();
                    if (frenchData && frenchData.success) {
                        return frenchData;
                    }
                }
            }
            
            return data;
        } catch (error) {
            console.error('Error fetching movie info:', error);
            return null;
        }
    }

    async getFrenchVersion(originalTitle, subjectType) {
        try {
            // Remove any existing version tags
            const cleanTitle = originalTitle.replace(/\s*\[Version française\]\s*/gi, '').trim();
            const frenchTitle = `${cleanTitle} [Version française]`;
            
            // Search for French version
            const response = await fetch(`${this.baseURL}/api/search/${encodeURIComponent(frenchTitle)}`);
            const data = await response.json();
            
            if (data.status === 200 && data.success && data.results.items.length > 0) {
                // Find exact match with French version tag
                const frenchMovie = data.results.items.find(item => 
                    item.title.toLowerCase().includes('[version française]') && 
                    item.hasResource === true &&
                    item.subjectType === subjectType
                );
                
                if (frenchMovie) {
                    console.log(`French version found for: ${originalTitle}`);
                    return frenchMovie;
                }
            }
            
            console.log(`No French version available for: ${originalTitle}, using original`);
            return null;
        } catch (error) {
            console.error('Error checking for French version:', error);
            return null;
        }
    }

    async getDownloadSources(movieId, season = null, episode = null) {
        try {
            let url = `${this.baseURL}/api/sources/${movieId}`;
            if (season !== null && episode !== null) {
                url += `?season=${season}&episode=${episode}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                return data;
            } else if (data.sources && data.sources.length > 0) {
                return { results: data.sources };
            } else {
                return { results: [] };
            }
        } catch (error) {
            console.error('Error fetching download sources:', error);
            return { results: [] };
        }
    }

    createMovieCards(movies) {
        if (!movies || movies.length === 0) {
            return '<div class="loading"><div class="spinner"></div></div>';
        }

        return movies.map(movie => {
            const continueWatchingData = this.getContinueWatchingData(movie.subjectId);
            const progressBar = continueWatchingData ? `
                <div class="continue-progress">
                    <div class="continue-progress-bar" style="width: ${continueWatchingData.progress}%"></div>
                </div>
                <div class="continue-watching-indicator">Continue</div>
            ` : '';

            const rating = movie.imdbRatingValue ? `<i class="fas fa-star" style="color: #f5c518;"></i> ${movie.imdbRatingValue}` : 'N/A';

            return `
                <div class="movie-card" data-id="${movie.subjectId}">
                    ${movie.subjectType === 2 ? '<div class="movie-type">Series</div>' : '<div class="movie-type">Movie</div>'}
                    <img src="${movie.cover?.url || movie.thumbnail || 'https://via.placeholder.com/140x200/333/666?text=No+Image'}" 
                         alt="${movie.title}" 
                         class="movie-poster"
                         loading="lazy"
                         onerror="this.src='https://via.placeholder.com/140x200/333/666?text=No+Image'">
                    ${progressBar}
                    <div class="movie-info">
                        <h3 class="movie-title">${movie.title}</h3>
                        <div class="movie-meta">
                            <span><i class="fas fa-calendar"></i> ${movie.releaseDate?.split('-')[0] || '2025'}</span>
                            <span>${rating}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    addMovieCardListeners() {
        document.querySelectorAll('.movie-card').forEach(card => {
            card.addEventListener('click', () => {
                const movieId = card.dataset.id;
                // Always redirect to details page, even for continue watching items
                window.location.href = `/details?id=${movieId}`;
            });
        });
    }

    getContinueWatchingData(movieId) {
        const continueData = JSON.parse(localStorage.getItem('continueWatchingData') || '{}');
        return continueData[movieId];
    }

    updateContinueWatchingProgress(movieId, currentTime, duration) {
        const progress = (currentTime / duration) * 100;
        const continueData = JSON.parse(localStorage.getItem('continueWatchingData') || '{}');
        
        continueData[movieId] = {
            currentTime: currentTime,
            duration: duration,
            progress: progress,
            lastWatched: new Date().toISOString(),
            movieId: movieId
        };
        
        localStorage.setItem('continueWatchingData', JSON.stringify(continueData));
        this.loadContinueWatching();
    }

    removeFromContinueWatching(movieId) {
        const continueData = JSON.parse(localStorage.getItem('continueWatchingData') || '{}');
        delete continueData[movieId];
        localStorage.setItem('continueWatchingData', JSON.stringify(continueData));
        this.loadContinueWatching();
    }

    loadContinueWatching() {
        const container = document.getElementById('continue-watching');
        if (!container) return;
        
        const continueData = JSON.parse(localStorage.getItem('continueWatchingData') || '{}');
        const movieIds = Object.keys(continueData);
        
        if (movieIds.length > 0) {
            const sortedMovies = movieIds
                .map(movieId => continueData[movieId])
                .sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched))
                .slice(0, 6);

            Promise.all(
                sortedMovies.map(item => this.getMovieInfo(item.movieId))
            ).then(movies => {
                const validMovies = movies
                    .filter(movie => movie && movie.success)
                    .map(movie => movie.results.subject);
                
                container.innerHTML = this.createMovieCards(validMovies);
                this.addMovieCardListeners();
            });
        } else {
            container.innerHTML = '<p class="text-center">No recent movies. Start watching to see them here!</p>';
        }
    }

    async loadCategoryContent(category) {
        let searchQuery = '';
        switch(category) {
            case 'action': searchQuery = 'action 2025'; break;
            case 'comedy': searchQuery = 'comedy 2025'; break;
            case 'drama': searchQuery = 'drama 2025'; break;
            case 'sci-fi': searchQuery = 'sci-fi 2025'; break;
            case 'horror': searchQuery = 'horror 2025'; break;
            case 'anime': searchQuery = 'anime 2025'; break;
            case 'korean': searchQuery = 'korean drama 2025'; break;
            case 'nollywood': searchQuery = 'nollywood 2025'; break;
            case 'bollywood': searchQuery = 'bollywood 2025'; break;
            case 'chinese': searchQuery = 'chinese 2025'; break;
            case 'romance': searchQuery = 'romance 2025'; break;
            case 'teen-movies': searchQuery = 'teen movies 2025'; break;
            case 'teen-series': searchQuery = 'teen series 2025'; break;
            case 'disney': searchQuery = 'disney 2025'; break;
            case 'marvel': searchQuery = 'marvel 2025'; break;
            default: searchQuery = '2025'; break;
        }

        const response = await this.searchMovies(searchQuery, 15);
        const container = document.getElementById('most-watched-movies');
        if (container) {
            container.innerHTML = this.createMovieCards(response.results.items);
            this.addMovieCardListeners();
        }
    }

    formatDuration(seconds) {
        if (!seconds) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        const mb = Math.round(parseInt(bytes) / (1024 * 1024));
        return `${mb} MB`;
    }

    async shareMovie(movieId, movieTitle) {
        const shareUrl = `${window.location.origin}/details?id=${movieId}`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: movieTitle,
                    text: shareUrl,
                    url: shareUrl
                });
            } catch (error) {
                console.log('Error sharing:', error);
                this.copyToClipboard(shareUrl);
            }
        } else {
            this.copyToClipboard(shareUrl);
        }
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Link copied to clipboard!');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Link copied to clipboard!');
        });
    }

    showToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        toast.innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--primary)"></i>
            <span>${message}</span>
        `;
        
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    performSearch(query, resultsContainer) {
        if (!resultsContainer) return;
        
        if (query.length < 2) {
            resultsContainer.innerHTML = '<p class="text-center mt-1">Type at least 2 characters to search</p>';
            return;
        }

        resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        fetch(`${this.baseURL}/api/search/${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 200 && data.success && data.results.items.length > 0) {
                    resultsContainer.innerHTML = `
                        <div class="search-results-list">
                            ${data.results.items.map(movie => `
                                <div class="search-result-item" data-id="${movie.subjectId}">
                                    <img src="${movie.cover?.url || movie.thumbnail || 'https://via.placeholder.com/80x120/333/666?text=No+Image'}" 
                                         alt="${movie.title}" 
                                         class="search-result-poster"
                                         onerror="this.src='https://via.placeholder.com/80x120/333/666?text=No+Image'">
                                    <div class="search-result-details">
                                        <h3 class="search-result-title">${movie.title}</h3>
                                        <div class="search-result-meta">
                                            <span class="year">${movie.releaseDate?.split('-')[0] || '2025'}</span>
                                            <span class="rating">${movie.imdbRatingValue || 'N/A'}</span>
                                            <span class="type">${movie.subjectType === 2 ? 'Series' : 'Movie'}</span>
                                        </div>
                                        ${movie.genre ? `<p class="search-result-genre">${movie.genre.split(',').slice(0, 3).join(', ')}</p>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    
                    document.querySelectorAll('.search-result-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const movieId = item.dataset.id;
                            window.location.href = `/details?id=${movieId}`;
                        });
                    });
                } else {
                    resultsContainer.innerHTML = '<p class="text-center mt-1">No results found for "' + query + '"</p>';
                }
            })
            .catch(error => {
                console.error('Search error:', error);
                resultsContainer.innerHTML = '<p class="text-center mt-1">Error performing search. Please try again.</p>';
            });
    }

    loadPlayer = async function(movieId, startTime = 0, season = null, episode = null) {
        try {
            // Ensure Plyr player is initialized first
            if (!this.player) {
                this.initPlyrPlayer();
            }
            
            const movieInfo = await this.getMovieInfo(movieId);
            if (!movieInfo || !movieInfo.success) {
                throw new Error('Failed to load movie info');
            }

            this.currentMovie = movieInfo.results.subject;
            
            // Update title
            document.getElementById('player-title').textContent = this.currentMovie.title;
            const overlayTitle = document.getElementById('overlay-title');
            if (overlayTitle) {
                overlayTitle.textContent = this.currentMovie.title;
            }
            
            const sources = await this.getDownloadSources(movieId, season, episode);
            if (!sources.results || sources.results.length === 0) {
                throw new Error('No video sources available');
            }

            // Prepare quality sources for Plyr
            const qualitySources = sources.results.map(source => {
                // Extract number from quality string (e.g., "480p" -> 480, "1080P" -> 1080)
                let qualityNumber = 480; // default
                if (source.quality) {
                    const match = source.quality.toString().match(/(\d+)/);
                    if (match) {
                        qualityNumber = parseInt(match[1]);
                    }
                }
                
                return {
                    src: source.stream_url || source.download_url,
                    type: 'video/mp4',
                    size: qualityNumber
                };
            });
            
            // Remove duplicates and sort by quality (lowest first for default)
            const uniqueSources = [];
            const seenSizes = new Set();
            qualitySources.forEach(source => {
                if (!seenSizes.has(source.size)) {
                    seenSizes.add(source.size);
                    uniqueSources.push(source);
                }
            });
            uniqueSources.sort((a, b) => a.size - b.size);
            
            console.log('Available qualities:', uniqueSources.map(s => s.size));
            
            // Set the video source for Plyr
            if (this.player) {
                // Set all quality sources at once
                this.player.source = {
                    type: 'video',
                    sources: uniqueSources,
                    poster: this.currentMovie.poster || this.currentMovie.coverHorizontalUrl || ''
                };
                
                // Wait for player to be ready
                this.player.once('ready', () => {
                    // Set start time if provided
                    if (startTime > 0) {
                        this.player.currentTime = parseFloat(startTime);
                    }
                    
                    // Auto-play
                    this.player.play().catch(err => {
                        console.log('Auto-play prevented:', err);
                    });
                    
                    // Auto-fullscreen on mobile
                    if (this.isMobile()) {
                        setTimeout(() => {
                            this.player.fullscreen.enter();
                        }, 500);
                    }
                });
                
                await this.loadPlayerRelatedMovies();
            }
        } catch (error) {
            console.error('Error loading player:', error);
            alert('Error loading video. Please try again.');
        }
    }

    setupQualityOptions(sources) {
        const qualitySubmenu = document.getElementById('quality-submenu');
        qualitySubmenu.innerHTML = '';
        
        sources.forEach(source => {
            const option = document.createElement('div');
            option.className = 'settings-suboption';
            option.dataset.quality = source.quality;
            option.textContent = `${source.quality}p`;
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeVideoQuality(source.stream_url || source.download_url, source.quality);
            });
            qualitySubmenu.appendChild(option);
        });
    }

    changeVideoQuality(url, quality) {
        const video = document.getElementById('player-video');
        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;
        
        this.showPlayerLoading();
        video.src = url;
        video.currentTime = currentTime;
        
        video.addEventListener('canplay', () => {
            this.hidePlayerLoading();
            if (wasPlaying) {
                video.play();
            }
            this.showToast(`Quality changed to ${quality}p`);
        }, { once: true });
    }

    async loadPlayerRelatedMovies() {
        if (!this.currentMovie) return;
        
        const relatedResponse = await this.searchMovies(this.currentMovie.genre?.split(',')[0] || '2025', 10);
        const relatedContainer = document.getElementById('player-related-movies');
        
        if (relatedContainer) {
            relatedContainer.innerHTML = this.createMovieCards(relatedResponse.results.items);
            
            document.querySelectorAll('#player-related-movies .movie-card').forEach(card => {
                card.addEventListener('click', () => {
                    const movieId = card.dataset.id;
                    window.location.href = `/details?id=${movieId}`;
                });
            });
        }
    }
}

// Page-specific initialization
document.addEventListener('DOMContentLoaded', () => {
    const handyFlix = new HandyFlix();
    
    if (window.location.pathname === '/search') {
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');
        
        if (searchInput) {
            const urlParams = new URLSearchParams(window.location.search);
            const searchQuery = urlParams.get('q');
            if (searchQuery) {
                searchInput.value = searchQuery;
                handyFlix.performSearch(searchQuery, searchResults);
            }
            
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const newUrl = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
                window.history.pushState({}, '', newUrl);
                handyFlix.performSearch(query, searchResults);
            });
            
            searchInput.focus();
        }
        
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const searchQuery = urlParams.get('q');
            if (searchInput) {
                searchInput.value = searchQuery || '';
                handyFlix.performSearch(searchQuery || '', searchResults);
            }
        });
    }
    
    if (window.location.pathname === '/details') {
        const urlParams = new URLSearchParams(window.location.search);
        const movieId = urlParams.get('id');
        
        if (movieId) {
            handyFlix.loadMovieDetails(movieId);
        }
    }
    
    if (window.location.pathname === '/player') {
        const urlParams = new URLSearchParams(window.location.search);
        const movieId = urlParams.get('id');
        const startTime = urlParams.get('time');
        const season = urlParams.get('season');
        const episode = urlParams.get('episode');
        
        if (movieId) {
            handyFlix.loadPlayer(movieId, startTime, season, episode);
        }
    }
    
    if (window.location.pathname.startsWith('/category/')) {
        const category = window.location.pathname.split('/').pop();
        handyFlix.loadCategoryPage(category);
    }
});

HandyFlix.prototype.loadMovieDetails = async function(movieId) {
    try {
        const movieInfo = await this.getMovieInfo(movieId);
        if (!movieInfo || !movieInfo.success) {
            throw new Error('Failed to load movie details');
        }

        this.currentMovie = movieInfo.results.subject;
        await this.renderMovieDetails(movieInfo.results);
    } catch (error) {
        console.error('Error loading movie details:', error);
        alert('Error loading movie details. Please try again.');
    }
};

HandyFlix.prototype.renderMovieDetails = async function(movieData) {
    const movie = movieData.subject;
    const isSeries = movie.subjectType === 2;
    
    const relatedResponse = await this.searchMovies(movie.genre?.split(',')[0] || '2025', 14);
    const relatedMovies = relatedResponse.results.items.filter(m => m.subjectId !== movie.subjectId).slice(0, 14);
    
    let seasonsHtml = '';
    if (isSeries && movieData.resource && movieData.resource.seasons) {
        seasonsHtml = await this.renderSeasons(movieData.resource.seasons, movie.subjectId);
    }

    let castHtml = '';
    if (movieData.stars && movieData.stars.length > 0) {
        castHtml = this.renderCast(movieData.stars);
    }

    let trailerHtml = '';
    if (movie.trailer && movie.trailer.videoAddress) {
        trailerHtml = this.renderTrailer(movie.trailer);
    }

    const detailsContent = document.getElementById('movie-details-content');
    if (detailsContent) {
        detailsContent.innerHTML = `
            ${trailerHtml}
            <h1 class="details-title">${movie.title}</h1>
            <div class="details-meta">
                <span>${movie.releaseDate?.split('-')[0] || '2025'}</span>
                <span>${this.formatDuration(movie.duration)}</span>
                <span>Rating: ${movie.imdbRatingValue || 'N/A'}</span>
            </div>
            <div class="details-genre">
                ${movie.genre ? movie.genre.split(',').map(genre => 
                    `<span class="genre-tag">${genre.trim()}</span>`
                ).join('') : ''}
            </div>
            <p class="details-description">${movie.description || 'No description available.'}</p>
            <div class="details-actions">
                <button class="btn btn-primary" id="stream-btn">
                    <i class="fas fa-play"></i> Play
                </button>
                <button class="btn btn-secondary" id="download-btn">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn btn-secondary btn-share" id="share-btn">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
            ${castHtml}
            ${seasonsHtml}
            <div class="related-section">
                <h3 class="related-title">Related Movies & Series</h3>
                <div class="movies-row" id="details-related-movies">
                    ${this.createMovieCards(relatedMovies)}
                </div>
            </div>
            <div class="download-options" id="download-options">
                <div class="download-title">Download Options</div>
                <div id="download-options-list"></div>
            </div>
        `;

        document.getElementById('stream-btn').addEventListener('click', async () => {
            if (isSeries) {
                alert('Please select a season and episode to stream');
            } else {
                const sources = await this.getDownloadSources(movie.subjectId);
                if (sources.results && sources.results.length > 0) {
                    window.location.href = `/player?id=${movie.subjectId}`;
                } else {
                    alert('No streaming sources available for this movie.');
                }
            }
        });

        document.getElementById('download-btn').addEventListener('click', async () => {
            await this.showDownloadOptions(movie.subjectId);
        });

        document.getElementById('share-btn').addEventListener('click', () => {
            this.shareMovie(movie.subjectId, movie.title);
        });

        if (movie.trailer && movie.trailer.videoAddress) {
            this.setupTrailer();
        }

        // Load cast images progressively
        this.loadCastImages();

        setTimeout(() => {
            document.querySelectorAll('#details-related-movies .movie-card').forEach(card => {
                card.addEventListener('click', () => {
                    const movieId = card.dataset.id;
                    window.location.href = `/details?id=${movieId}`;
                });
            });
        }, 100);
    }
};

HandyFlix.prototype.loadCastImages = function() {
    const castAvatars = document.querySelectorAll('.cast-avatar[data-src]');
    
    castAvatars.forEach((img, index) => {
        // Stagger the loading slightly for better performance
        setTimeout(() => {
            const actualSrc = img.getAttribute('data-src');
            
            // Validate URL to prevent XSS - only allow http/https URLs
            if (!actualSrc || (!actualSrc.startsWith('http://') && !actualSrc.startsWith('https://'))) {
                img.setAttribute('data-loaded', 'true');
                return;
            }
            
            const tempImg = new Image();
            
            tempImg.onload = function() {
                img.src = actualSrc;
                img.setAttribute('data-loaded', 'true');
            };
            
            tempImg.onerror = function() {
                img.setAttribute('data-loaded', 'true');
                // Keep the placeholder or use a personalized one
            };
            
            tempImg.src = actualSrc;
        }, index * 50); // 50ms delay between each image
    });
};

HandyFlix.prototype.setupTrailer = function() {
    const playPauseBtn = document.getElementById('trailer-play-pause');
    const restartBtn = document.getElementById('trailer-restart');
    const trailerVideo = document.getElementById('trailer-video');
    
    if (playPauseBtn && restartBtn && trailerVideo) {
        // Play/Pause button
        playPauseBtn.addEventListener('click', () => {
            if (trailerVideo.paused) {
                trailerVideo.play();
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                trailerVideo.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });

        // Restart button
        restartBtn.addEventListener('click', () => {
            trailerVideo.currentTime = 0;
            trailerVideo.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        });

        // Update play/pause icon when video plays/pauses
        trailerVideo.addEventListener('play', () => {
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        });

        trailerVideo.addEventListener('pause', () => {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        });
    }
};

HandyFlix.prototype.renderSeasons = async function(seasons, movieId) {
    const sortedSeasons = seasons.sort((a, b) => a.se - b.se);
    
    let seasonsHtml = '<div class="seasons-section"><h3 class="seasons-title">Episodes & Seasons</h3>';
    
    seasonsHtml += `
        <div class="season-selector">
            <select class="season-dropdown" id="season-dropdown" style="display: none;">
                <option value="">Select Season</option>
                ${sortedSeasons.map((season, index) => `
                    <option value="${season.se}">Season ${index + 1}</option>
                `).join('')}
            </select>
            <div class="custom-season-selector">
                <button class="custom-season-button" id="custom-season-button">
                    <span class="season-text">
                        <i class="fas fa-list season-icon"></i>
                        <span id="selected-season-text">Select Season</span>
                    </span>
                    <i class="fas fa-chevron-down dropdown-arrow"></i>
                </button>
                <div class="custom-season-options" id="custom-season-options">
                    ${sortedSeasons.map((season, index) => `
                        <div class="custom-season-option" data-value="${season.se}" data-max-ep="${season.maxEp || 10}">
                            Season ${index + 1}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div id="episodes-container"></div>
    `;
    
    seasonsHtml += '</div>';
    
    setTimeout(() => {
        this.setupCustomSeasonSelector(sortedSeasons, movieId);
    }, 100);
    
    return seasonsHtml;
};

HandyFlix.prototype.setupCustomSeasonSelector = function(sortedSeasons, movieId) {
    const customButton = document.getElementById('custom-season-button');
    const customOptions = document.getElementById('custom-season-options');
    const selectedText = document.getElementById('selected-season-text');
    
    if (!customButton || !customOptions || !selectedText) return;
    
    // Toggle dropdown
    customButton.addEventListener('click', (e) => {
        e.stopPropagation();
        customButton.classList.toggle('active');
        customOptions.classList.toggle('active');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!customButton.contains(e.target) && !customOptions.contains(e.target)) {
            customButton.classList.remove('active');
            customOptions.classList.remove('active');
        }
    });
    
    // Handle option selection
    const options = document.querySelectorAll('.custom-season-option');
    options.forEach((option, index) => {
        option.addEventListener('click', () => {
            const seasonNum = parseInt(option.dataset.value);
            const maxEp = parseInt(option.dataset.maxEp);
            
            // Update selected state
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            
            // Update button text
            selectedText.textContent = `Season ${index + 1}`;
            
            // Close dropdown
            customButton.classList.remove('active');
            customOptions.classList.remove('active');
            
            // Render episodes
            this.renderEpisodesForSeason(seasonNum, maxEp, movieId);
        });
    });
    
    // Select first season by default
    if (sortedSeasons.length > 0 && options.length > 0) {
        options[0].click();
    }
};

HandyFlix.prototype.renderEpisodesForSeason = function(season, episodeCount, movieId) {
    const episodesContainer = document.getElementById('episodes-container');
    if (!episodesContainer) return;
    
    let episodesHtml = '<div class="episodes-grid">';
    
    for (let i = 1; i <= episodeCount; i++) {
        episodesHtml += `
            <div class="episode-card" data-movie-id="${movieId}" data-season="${season}" data-episode="${i}">
                <div class="episode-number">${i}</div>
            </div>
        `;
    }
    
    episodesHtml += '</div>';
    episodesContainer.innerHTML = episodesHtml;
    
    document.querySelectorAll('.episode-card').forEach(card => {
        card.addEventListener('click', async () => {
            const movieId = card.dataset.movieId;
            const season = card.dataset.season;
            const episode = card.dataset.episode;
            
            window.location.href = `/player?id=${movieId}&season=${season}&episode=${episode}`;
        });
    });
};

HandyFlix.prototype.loadCategoryPage = async function(category) {
    const categoryTitle = document.getElementById('category-title');
    if (categoryTitle) {
        const title = category.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        categoryTitle.textContent = title;
    }
    
    let searchQuery = '';
    switch(category) {
        case 'action': searchQuery = 'action 2025'; break;
        case 'comedy': searchQuery = 'comedy 2025'; break;
        case 'drama': searchQuery = 'drama 2025'; break;
        case 'sci-fi': searchQuery = 'sci-fi 2025'; break;
        case 'horror': searchQuery = 'horror 2025'; break;
        case 'anime': searchQuery = 'anime 2025'; break;
        case 'korean': searchQuery = 'korean drama 2025'; break;
        case 'nollywood': searchQuery = 'nollywood 2025'; break;
        case 'bollywood': searchQuery = 'bollywood 2025'; break;
        case 'chinese': searchQuery = 'chinese 2025'; break;
        case 'romance': searchQuery = 'romance 2025'; break;
        case 'teen-movies': searchQuery = 'teen movies 2025'; break;
        case 'teen-series': searchQuery = 'teen series 2025'; break;
        case 'disney': searchQuery = 'disney 2025'; break;
        case 'marvel': searchQuery = 'marvel 2025'; break;
        case 'trending': searchQuery = '2025'; break;
        case 'new-releases': searchQuery = 'halloween 2025'; break;
        case 'popular-movies': searchQuery = '2025'; break;
        case 'popular-series': searchQuery = 'series 2025'; break;
        default: searchQuery = '2025'; break;
    }

    const response = await this.searchMovies(searchQuery, 50);
    const categoryContent = document.getElementById('category-content');
    
    if (categoryContent) {
        // Use the new grid layout for better presentation
        categoryContent.innerHTML = `<div class="category-grid">${this.createMovieCards(response.results.items)}</div>`;
        this.addMovieCardListeners();
    }
};

HandyFlix.prototype.showDownloadOptions = async function(movieId) {
    const sources = await this.getDownloadSources(movieId);
    const downloadOptionsList = document.getElementById('download-options-list');
    const downloadOptions = document.getElementById('download-options');
    
    if (!downloadOptionsList || !downloadOptions) return;
    
    downloadOptionsList.innerHTML = '';
    
    if (sources.results && sources.results.length > 0) {
        sources.results.forEach(source => {
            const option = document.createElement('button');
            option.className = 'download-option';
            option.innerHTML = `
                <strong>${source.quality}</strong> - ${this.formatFileSize(source.size)}
            `;
            option.addEventListener('click', () => {
                this.downloadMovie(source.download_url, `${this.currentMovie.title} - ${source.quality}.mp4`);
            });
            downloadOptionsList.appendChild(option);
        });
        
        downloadOptions.style.display = 'block';
    } else {
        alert('No download sources available for this movie.');
    }
};

HandyFlix.prototype.downloadMovie = function(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

HandyFlix.prototype.renderTrailer = function(trailer) {
    return `
        <div class="trailer-section">
            <div class="trailer-player">
                <video class="trailer-video" id="trailer-video" preload="metadata" autoplay muted loop playsinline>
                    <source src="${trailer.videoAddress.url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div class="trailer-custom-controls">
                    <button class="trailer-control-btn" id="trailer-play-pause" title="Play/Pause">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="trailer-control-btn" id="trailer-restart" title="Restart">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
};

HandyFlix.prototype.renderCast = function(stars) {
    return `
        <div class="cast-section">
            <h3 class="cast-title">Cast</h3>
            <div class="cast-grid">
                ${stars.map((star, index) => {
                    const placeholderUrl = 'https://via.placeholder.com/60x60/333/666?text=No+Image';
                    const avatarUrl = star.avatarUrl || placeholderUrl;
                    return `
                        <div class="cast-card">
                            <img src="${placeholderUrl}" 
                                 data-src="${avatarUrl}" 
                                 alt="${star.name}" 
                                 class="cast-avatar"
                                 data-loaded="false"
                                 loading="lazy"
                                 onerror="this.dataset.loaded='true'; this.src='https://via.placeholder.com/60x60/333/666?text=${encodeURIComponent(star.name.charAt(0))}'">
                            <div class="cast-name">${star.name}</div>
                            <div class="cast-character">${star.character || 'Actor'}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
};



