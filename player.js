document.addEventListener('DOMContentLoaded', () => {
    // Playlist Source
    const playlistUrl = 'https://iptv-org.github.io/iptv/languages/mal.m3u';
    
    // DOM Elements
    const video = document.getElementById('tv-player');
    const channelList = document.getElementById('channel-list');
    const searchInput = document.getElementById('search-input');
    const statusText = document.getElementById('status-text');
    const sidebar = document.getElementById('sidebar');
    const topBar = document.getElementById('top-bar');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const closeSidebarMobileBtn = document.getElementById('close-sidebar-mobile');
    
    let allChannels = [];
    let hls = null;
    let player = null;
    let topBarTimeout;

    // 1. Fetch & Parse Playlist
    fetch(playlistUrl)
        .then(res => res.text())
        .then(data => {
            const lines = data.split('\n');
            let currentName = '';
            let channelIndex = 1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXTINF')) {
                    currentName = line.substring(line.lastIndexOf(',') + 1).trim();
                } else if (line.startsWith('http')) {
                    // Filter rule: Exclude Mazhavil Manorama HD
                    if (!currentName.includes('Mazhavil Manorama HD (1080p)')) {
                        allChannels.push({ id: channelIndex++, name: currentName, url: line });
                    }
                }
            }
            renderChannels(allChannels);
            autoPlay24News();
        })
        .catch(() => {
            channelList.innerHTML = '<p class="text-red-500 p-4 text-center">Failed to load playlist. Check connection.</p>';
            statusText.textContent = 'Playlist Error';
        });

    // 2. Render Sidebar Buttons
    function renderChannels(channels) {
        channelList.innerHTML = '';
        channels.forEach(channel => {
            const btn = document.createElement('button');
            btn.className = 'channel-btn w-full text-left p-3.5 border-b border-gray-800 text-white hover:bg-gray-800 flex items-center transition cursor-pointer';
            // Inject the fixed channel ID and Name
            btn.innerHTML = `<span class="text-gray-500 font-mono w-10 shrink-0 text-sm">${channel.id}.</span> <span>${channel.name}</span>`;
            
            btn.onclick = () => playStream(channel.name, channel.url, btn);
            channelList.appendChild(btn);
        });
    }

    // 3. Search Filter (Keeps original numbers intact)
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allChannels.filter(c => c.name.toLowerCase().includes(term));
        renderChannels(filtered);
    });

    // 4. Playback Logic & Stream Switching
    function playStream(name, url, btnElement) {
        statusText.textContent = `Loading: ${name}...`;
        
        // UI Highlighting
        document.querySelectorAll('.channel-btn').forEach(b => {
            b.classList.remove('bg-red-700', 'hover:bg-red-600');
            b.classList.add('hover:bg-gray-800');
        });
        if (btnElement) {
            btnElement.classList.remove('hover:bg-gray-800');
            btnElement.classList.add('bg-red-700', 'hover:bg-red-600');
        }

        // Auto-close sidebar on mobile devices after selection
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }

        // DESTROY OLD STREAMS to prevent infinite loading
        if (player) { player.destroy(); player = null; }
        if (hls) { hls.destroy(); hls = null; }
        
        video.removeAttribute('src');
        video.load();

        // Plyr Configuration
        const defaultOptions = {
            controls: ['play', 'mute', 'volume', 'settings', 'fullscreen'],
            settings: ['quality']
        };

        if (Hls.isSupported()) {
            hls = new Hls({ maxMaxBufferLength: 30 }); // Optimize buffer for Live TV
            hls.loadSource(url);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // Map HLS qualities into Plyr settings
                const availableQualities = hls.levels.map(l => l.height);
                defaultOptions.quality = {
                    default: availableQualities[availableQualities.length - 1],
                    options: availableQualities,
                    forced: true,
                    onChange: (e) => updateQuality(e)
                };
                
                player = new Plyr(video, defaultOptions);
                statusText.textContent = `Playing: ${name}`;
                
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => console.log("Autoplay blocked by browser. Click screen to play."));
                }
            });

            // Error Handling (Dead links)
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    statusText.textContent = `Stream Offline: ${name}`;
                    if(player) player.destroy();
                }
            });

            window.updateQuality = (newQuality) => {
                hls.levels.forEach((level, levelIndex) => {
                    if (level.height === newQuality) hls.currentLevel = levelIndex;
                });
            };

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari Native Support Fallback
            video.src = url;
            player = new Plyr(video, defaultOptions);
            video.addEventListener('loadedmetadata', () => {
                statusText.textContent = `Playing: ${name}`;
                video.play();
            });
            video.addEventListener('error', () => {
                statusText.textContent = `Stream Offline: ${name}`;
            });
        }
    }

    // 5. Auto-Play "24 News" Initialization
    function autoPlay24News() {
        const targetChannel = allChannels.find(c => c.name.toLowerCase().includes('24 news')) || allChannels[0];
        if (targetChannel) {
            const buttons = Array.from(document.querySelectorAll('.channel-btn'));
            const targetBtn = buttons.find(b => b.textContent.includes(targetChannel.name));
            playStream(targetChannel.name, targetChannel.url, targetBtn);
        }
    }

    // 6. UI Interactions (Sidebar & Top Bar)
    function toggleMenu() {
        sidebar.classList.toggle('open');
        // Prevent auto-focusing on mobile so keyboard doesn't pop up
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            searchInput.focus();
        }
    }
    
    toggleSidebarBtn.addEventListener('click', toggleMenu);
    closeSidebarMobileBtn.addEventListener('click', () => sidebar.classList.remove('open'));

    // Auto-hide Top Bar Activity Monitor
    function wakeUpTopBar() {
        topBar.classList.remove('hide');
        clearTimeout(topBarTimeout);
        topBarTimeout = setTimeout(() => {
            if (!video.paused) {
                topBar.classList.add('hide');
            }
        }, 3000);
    }

    ['mousemove', 'click', 'touchstart', 'keydown'].forEach(evt => {
        document.addEventListener(evt, wakeUpTopBar);
    });

    // 7. Android TV Remote (D-Pad) Spatial Navigation
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const isChannelBtn = active.classList.contains('channel-btn');
        
        if (isChannelBtn) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = active.nextElementSibling;
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = active.previousElementSibling;
                if (prev) prev.focus();
                else searchInput.focus();
            }
        } else if (active === searchInput && e.key === 'ArrowDown') {
            e.preventDefault();
            const firstChannel = document.querySelector('.channel-btn');
            if (firstChannel) firstChannel.focus();
        }
    });
});
