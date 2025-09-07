import { pipeline, env } from '@xenova/transformers';

// Disable local model loading, use remote models
env.allowRemoteModels = true;
env.allowLocalModels = false;

class AudioCaptioner {
    constructor() {
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.captionBtn = document.getElementById('captionBtn');
        this.captionsDisplay = document.getElementById('captionsDisplay');
        this.captionsHistory = document.getElementById('captionsHistory');
        this.playerSection = document.getElementById('playerSection');
        this.audioFile = document.getElementById('audioFile');
        this.captionFile = document.getElementById('captionFile');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.replayBtn = document.getElementById('replayBtn');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.analysisResults = document.getElementById('analysisResults');
        
        this.transcriber = null;
        this.isProcessing = false;
        this.captions = [];
        this.captionType = 'word'; // 'word' or 'sentence'
        this.currentAudioFile = null;
        this.emotionClassifier = null;
        this.emotionClassifier2 = null;
        
        this.initializeEventListeners();
        this.initializeTranscriber();
    }
    
    initializeEventListeners() {
        this.audioFile.addEventListener('change', (e) => this.handleFileUpload(e));
        this.captionFile.addEventListener('change', (e) => this.handleCaptionUpload(e));
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.captionBtn.addEventListener('click', () => this.generateCaptions());
        this.downloadBtn.addEventListener('click', () => this.downloadCaptions());
        this.replayBtn.addEventListener('click', () => this.replay());
        this.analyzeBtn.addEventListener('click', () => this.analyzeAudio());
        
        this.audioPlayer.addEventListener('play', () => this.updatePlayButton(false));
        this.audioPlayer.addEventListener('pause', () => this.updatePlayButton(true));
        this.audioPlayer.addEventListener('ended', () => this.updatePlayButton(true));
        this.audioPlayer.addEventListener('timeupdate', () => this.updateCurrentCaption());
    }
    
    async initializeTranscriber() {
        try {
            // Initialize the transcription pipeline
            this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        } catch (error) {
            console.error('Failed to initialize transcriber:', error);
        }
    }
    
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.currentAudioFile = file;
        const url = URL.createObjectURL(file);
        this.audioPlayer.src = url;
        this.playerSection.classList.add('active');
        
        // Clear previous captions
        this.captions = [];
        this.captionType = 'word';
        this.updateCaptionsDisplay('Upload complete! Click "Generate Captions" or "Load Captions" to start.');
        this.updateCaptionsHistory();
        
        // Reset caption button and hide download button
        this.captionBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path>
            </svg>
            Generate Captions
        `;
        this.captionBtn.classList.remove('active', 'processing');
        this.captionBtn.disabled = false;
        this.downloadBtn.style.display = 'none';
        this.replayBtn.style.display = 'none';
    }

    async handleCaptionUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentAudioFile) {
            this.showError('Please upload an audio file first before loading captions.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const srtContent = e.target.result;
                this.captions = this.parseSRT(srtContent);
                this.captionType = 'sentence';
                
                this.updateCaptionsDisplay('SRT captions loaded. Play the audio to see them.');
                this.updateCaptionsHistory();
                
                this.captionBtn.classList.add('active');
                this.captionBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"></path>
                    </svg>
                    Captions Loaded
                `;
                this.captionBtn.disabled = true; // Disable generation if SRT is loaded
                this.downloadBtn.style.display = 'none'; // Hide download for loaded SRT
                this.replayBtn.style.display = 'flex';
            } catch (error) {
                this.showError('Failed to parse SRT file: ' + error.message);
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    parseSRT(srtContent) {
        const lines = srtContent.replace(/\r/g, '').split('\n\n');
        const captions = [];

        const timeToSeconds = (time) => {
            const parts = time.split(/[:,]/);
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]) + parseInt(parts[3]) / 1000;
        };

        for (const line of lines) {
            if (line.trim() === '') continue;
            const parts = line.split('\n');
            if (parts.length < 3) continue;

            const timeMatch = parts[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
            if (timeMatch) {
                captions.push({
                    start: timeToSeconds(timeMatch[1]),
                    end: timeToSeconds(timeMatch[2]),
                    text: parts.slice(2).join(' ')
                });
            }
        }
        return captions;
    }
    
    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
        } else {
            this.audioPlayer.pause();
        }
    }
    
    updatePlayButton(isPaused) {
        const icon = this.playPauseBtn.querySelector('svg');
        if (isPaused) {
            icon.innerHTML = '<polygon points="5,3 19,12 5,21"></polygon>';
        } else {
            icon.innerHTML = '<rect x="4" y="3" width="4" height="18"></rect><rect x="12" y="3" width="4" height="18"></rect>';
        }
    }
    
    async generateCaptions() {
        if (this.isProcessing || !this.currentAudioFile) return;
        
        if (!this.transcriber) {
            this.showError('Transcriber is still loading. Please wait a moment and try again.');
            return;
        }
        
        // Clear previous captions display
        this.captionsDisplay.innerHTML = '';
        
        this.isProcessing = true;
        this.captionBtn.classList.add('processing');
        this.captionBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            Processing...
        `;
        
        // Add progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.innerHTML = '<div class="progress-fill"></div>';
        this.captionsDisplay.appendChild(progressBar);
        
        try {
            this.updateCaptionsDisplay('Converting audio file...');
            
            // Convert audio file to the format expected by the model
            const audioBuffer = await this.convertAudioFile(this.currentAudioFile);
            
            this.updateCaptionsDisplay('Transcribing audio... This may take a moment.');
            
            // Transcribe the audio with word-level timestamps
            const result = await this.transcriber(audioBuffer, {
                return_timestamps: "word",
                chunk_length_s: 30,
                stride_length_s: 5,
            });
            
            // Process the results into timed captions
            this.captions = this.processTranscriptionResult(result);
            
            this.captionBtn.classList.remove('processing');
            this.captionBtn.classList.add('active');
            this.captionBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"></path>
                </svg>
                Captions Ready
            `;
            
            this.updateCaptionsDisplay('Captions generated successfully! Play the audio to see synchronized captions.');
            this.updateCaptionsHistory();
            
            // Show download button
            this.downloadBtn.style.display = 'flex';
            this.replayBtn.style.display = 'flex';
            
        } catch (error) {
            console.error('Transcription error:', error);
            this.showError('Failed to transcribe audio: ' + error.message);
            this.captionBtn.classList.remove('processing');
        } finally {
            this.isProcessing = false;
            // Remove progress bar
            const progressBar = this.captionsDisplay.querySelector('.progress-bar');
            if (progressBar) progressBar.remove();
        }
    }
    
    async convertAudioFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Convert to mono and resample to 16kHz (required by Whisper)
                    const sampleRate = 16000;
                    const length = Math.floor(audioBuffer.duration * sampleRate);
                    const result = new Float32Array(length);
                    
                    // Get the first channel (mono)
                    const inputData = audioBuffer.getChannelData(0);
                    const ratio = inputData.length / length;
                    
                    for (let i = 0; i < length; i++) {
                        const index = Math.floor(i * ratio);
                        result[i] = inputData[index];
                    }
                    
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
    
    processTranscriptionResult(result) {
        if (!result.chunks) return [];
        
        const words = [];
        result.chunks.forEach(chunk => {
            if (chunk.timestamp && chunk.timestamp.length >= 2) {
                words.push({
                    text: chunk.text.trim(),
                    start: chunk.timestamp[0],
                    end: chunk.timestamp[1]
                });
            }
        });
        
        return words.filter(word => word.text.length > 0);
    }
    
    updateCurrentCaption() {
        if (this.captions.length === 0) return;
        
        if (this.captionType === 'word') {
            this.updateWordByWordCaption();
        } else {
            this.updateSentenceCaption();
        }
    }

    updateWordByWordCaption() {
        const currentTime = this.audioPlayer.currentTime;
        
        // Find the index of the last word that should be visible
        let lastWordIndex = -1;
        for (let i = 0; i < this.captions.length; i++) {
            if (currentTime >= this.captions[i].start) {
                lastWordIndex = i;
            } else {
                break;
            }
        }
        
        if (lastWordIndex >= 0) {
            // Check if we need to add more words
            const currentWordCount = this.captionsDisplay.querySelectorAll('.caption-word').length;
            const shouldShowWords = lastWordIndex + 1;
            
            if (shouldShowWords > currentWordCount) {
                // Add new words one by one
                for (let i = currentWordCount; i < shouldShowWords; i++) {
                    this.addWordToDisplay(this.captions[i].text);
                }
            }
        }
    }

    updateSentenceCaption() {
        const currentTime = this.audioPlayer.currentTime;
        let activeCaption = null;

        for (const caption of this.captions) {
            if (currentTime >= caption.start && currentTime <= caption.end) {
                activeCaption = caption;
                break;
            }
        }

        let captionContainer = this.captionsDisplay.querySelector('.current-caption');
        if (!captionContainer) {
            this.captionsDisplay.innerHTML = '';
            captionContainer = document.createElement('div');
            captionContainer.className = 'current-caption';
            this.captionsDisplay.appendChild(captionContainer);
        }

        const newText = activeCaption ? activeCaption.text : '';
        if (captionContainer.textContent !== newText) {
            captionContainer.textContent = newText;
        }
    }
    
    addWordToDisplay(word) {
        let currentCaptionDiv = this.captionsDisplay.querySelector('.current-caption');
        
        if (!currentCaptionDiv) {
            currentCaptionDiv = document.createElement('div');
            currentCaptionDiv.className = 'current-caption';
            this.captionsDisplay.innerHTML = '';
            this.captionsDisplay.appendChild(currentCaptionDiv);
        }
        
        const wordSpan = document.createElement('span');
        wordSpan.className = 'caption-word';
        wordSpan.textContent = word;
        currentCaptionDiv.appendChild(wordSpan);
    }
    
    updateCaptionsDisplay(text) {
        if (this.captionType === 'word' && text.trim() && !text.includes('Error:') && !text.includes('generated successfully') && !text.includes('Converting') && !text.includes('Transcribing') && !text.includes('Upload complete')) {
            // For live captions, don't replace - words are added individually
            return;
        } else {
            // For status messages, replace content
            this.captionsDisplay.innerHTML = `<p class="placeholder-text">${text || 'Captions will appear here when you start the captioning...'}</p>`;
        }
    }
    
    updateCaptionsHistory() {
        if (this.captions.length === 0) {
            this.captionsHistory.innerHTML = '';
            return;
        }

        let sentences;
        if (this.captionType === 'word') {
            sentences = [];
            let currentSentence = [];
            let sentenceStart = 0;
            
            this.captions.forEach((word, index) => {
                if (currentSentence.length === 0) {
                    sentenceStart = word.start;
                }
                currentSentence.push(word.text);
                
                // End sentence on punctuation or after 15 words
                if (word.text.match(/[.!?]$/) || currentSentence.length >= 15 || index === this.captions.length - 1) {
                    sentences.push({
                        text: currentSentence.join(' '),
                        start: sentenceStart,
                        end: word.end
                    });
                    currentSentence = [];
                }
            });
        } else {
            // For SRT, captions are already sentences
            sentences = this.captions;
        }
        
        this.captionsHistory.innerHTML = sentences
            .slice(-10) // Show last 10 sentences
            .map(sentence => `
                <div class="caption-item">
                    <strong>${this.formatTime(sentence.start)} - ${this.formatTime(sentence.end)}:</strong> ${sentence.text}
                </div>
            `).join('');
        
        // Scroll to bottom
        this.captionsHistory.scrollTop = this.captionsHistory.scrollHeight;
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showError(message) {
        this.updateCaptionsDisplay(`Error: ${message}`);
        console.error(message);
    }
    
    replay() {
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();
        this.captionsDisplay.innerHTML = '';
        if (this.captionType === 'sentence') {
            this.updateSentenceCaption();
        }
    }
    
    async analyzeAudio() {
        if (!this.currentAudioFile) return this.showError('Upload an audio file before analysis.');
        try {
            this.analysisResults.textContent = 'Loading analysis models...';
            if (!this.emotionClassifier) {
                this.emotionClassifier = await pipeline('audio-classification', 'Xenova/wav2vec2-base-superb-ks');
            }
            if (!this.emotionClassifier2) {
                this.emotionClassifier2 = await pipeline('audio-classification', 'prithivMLmods/Speech-Emotion-Classification-ONNX');
            }
            const mono16k = await this.convertAudioFile(this.currentAudioFile);
            const [ksResults, emoResults] = await Promise.all([
                this.emotionClassifier(mono16k),
                this.emotionClassifier2(mono16k)
            ]);
            const topKS = ksResults[0];
            const topEmo = emoResults.slice(0, 3);
            const { rms, zcr } = this.computeSignalStats(mono16k);
            this.analysisResults.innerHTML =
                `<div><strong>Top keyword:</strong> ${topKS.label} (${(topKS.score*100).toFixed(1)}%)</div>
                 <div><strong>Emotions:</strong> ${topEmo.map(e => `${e.label} ${(e.score*100).toFixed(1)}%`).join(', ')}</div>
                 <div><strong>Loudness (RMS):</strong> ${rms.toFixed(3)}</div>
                 <div><strong>Zero-crossing rate:</strong> ${zcr.toFixed(3)}</div>`;
        } catch (e) {
            console.error(e);
            this.analysisResults.textContent = 'Analysis failed: ' + e.message;
        }
    }
    
    computeSignalStats(arr) {
        let sumSq = 0, zc = 0;
        for (let i = 1; i < arr.length; i++) {
            sumSq += arr[i]*arr[i];
            if ((arr[i-1] >= 0 && arr[i] < 0) || (arr[i-1] < 0 && arr[i] >= 0)) zc++;
        }
        const rms = Math.sqrt(sumSq / arr.length);
        const zcr = zc / arr.length;
        return { rms, zcr };
    }
    
    downloadCaptions() {
        if (this.captions.length === 0 || this.captionType !== 'word') return;
        
        // Convert captions to SRT format
        const srtContent = this.generateSRTContent();
        
        // Create and download file
        const blob = new Blob([srtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentAudioFile.name.split('.')[0]}_captions.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    generateSRTContent() {
        // Group words into sentences for SRT format
        const sentences = [];
        let currentSentence = [];
        let sentenceStart = 0;
        let sentenceIndex = 1;
        
        this.captions.forEach((word, index) => {
            if (currentSentence.length === 0) {
                sentenceStart = word.start;
            }
            currentSentence.push(word.text);
            
            // End sentence on punctuation or after 10 words
            if (word.text.match(/[.!?]$/) || currentSentence.length >= 10 || index === this.captions.length - 1) {
                const startTime = this.formatSRTTime(sentenceStart);
                const endTime = this.formatSRTTime(word.end);
                const text = currentSentence.join(' ');
                
                sentences.push(`${sentenceIndex}\n${startTime} --> ${endTime}\n${text}\n`);
                
                currentSentence = [];
                sentenceIndex++;
            }
        });
        
        return sentences.join('\n');
    }
    
    formatSRTTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 1000);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AudioCaptioner();
});