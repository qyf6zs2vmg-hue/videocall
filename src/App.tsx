import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { MediaConnection, DataConnection } from 'peerjs';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  Phone, 
  PhoneOff, 
  Monitor, 
  MessageSquare, 
  Users, 
  HelpCircle, 
  Palette, 
  Copy, 
  Check, 
  Send, 
  Trash2, 
  Plus, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Eraser, 
  PenTool,
  Play,
  Hand,
  Smile,
  CircleStop,
  Download,
  MonitorUp,
  Settings,
  ChevronRight,
  MoreVertical,
  X,
  LayoutGrid,
  Languages,
  Sparkles,
  Volume2,
  Camera,
  Mic2,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Constants & Types ---
const LIBRETRANSLATE_URL = 'https://translate.argosopentech.com/translate';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

type Tab = 'calls' | 'chat' | 'board' | 'contacts' | 'help';

interface Message {
  id: string;
  text: string;
  time: string;
  isMine: boolean;
  from: string;
  translatedText?: string;
}

interface Contact {
  name: string;
  id: string;
}

interface DrawEvent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
}

// --- Helper Functions ---
const generate4DigitId = () => String(Math.floor(1000 + Math.random() * 9000));
const nowTime = () => {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
};

export default function App() {
  // --- State ---
  const [myId, setMyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('calls');
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const saved = localStorage.getItem('vc_contacts');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error loading contacts', e);
      return [];
    }
  });
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [callStatus, setCallStatus] = useState('Idle');
  const [callTimer, setCallTimer] = useState('0:00');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [remoteHandRaised, setRemoteHandRaised] = useState(false);
  const [reactions, setReactions] = useState<{id: number, emoji: string}[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactId, setNewContactId] = useState('');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vc_theme');
      return saved ? saved === 'dark' : true;
    }
    return true;
  });

  // --- Refs ---
  const peerRef = useRef<Peer | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- Whiteboard State ---
  const [wbTool, setWbTool] = useState<'draw' | 'erase'>('draw');
  const [wbColor, setWbColor] = useState('#3b82f6');
  const [wbSize, setWbSize] = useState(4);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // --- Toast Helper ---
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Theme Effect ---
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vc_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vc_theme', 'light');
    }
  }, [isDark]);

  // --- PeerJS Initialization ---
  useEffect(() => {
    const savedId = localStorage.getItem('vc_myid') || generate4DigitId();
    
    const initPeer = (id: string) => {
      // Clean up previous instance if it exists
      if (peerRef.current) {
        peerRef.current.destroy();
      }

      const peer = new Peer(id);
      peerRef.current = peer;

      peer.on('open', (assigned) => {
        setMyId(assigned);
        localStorage.setItem('vc_myid', assigned);
        showToast(`Connected with ID: ${assigned}`, 'success');
      });

      peer.on('error', (err) => {
        console.error('[PeerJS Error]', err);
        
        if (err.type === 'unavailable-id') {
          const newId = generate4DigitId();
          // Silently try a new ID if the generated one is taken
          setTimeout(() => {
            initPeer(newId);
            showToast('ID was taken, assigned a new one', 'info');
          }, 500);
        } else if (err.type === 'network' || err.type === 'server-error') {
          showToast('Connection lost. Retrying...', 'error');
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (peer.disconnected && !peer.destroyed) {
              peer.reconnect();
            } else if (peer.destroyed) {
              initPeer(localStorage.getItem('vc_myid') || generate4DigitId());
            }
          }, 3000);
        } else {
          showToast(`Peer Error: ${err.type}`, 'error');
        }
      });

      peer.on('call', (call) => {
        setIncomingCall(call);
      });

      peer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      peer.on('disconnected', () => {
        setCallStatus('Disconnected');
        showToast('Disconnected from server. Reconnecting...', 'info');
        peer.reconnect();
      });
    };

    initPeer(savedId);

    // Check for invite link
    const urlParams = new URLSearchParams(window.location.search);
    const callId = urlParams.get('call');
    if (callId && callId.length === 4) {
      setTimeout(() => {
        const input = document.getElementById('dialer-input') as HTMLInputElement;
        if (input) input.value = callId;
        showToast(`Invite detected for ID: ${callId}`, 'info');
      }, 2000);
    }

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [showToast]);

  const setupDataConnection = (conn: DataConnection) => {
    dataConnRef.current = conn;
    conn.on('open', () => {
      showToast('Data channel connected', 'success');
    });
    conn.on('data', (raw: any) => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'chat') {
          const receivedMsg = { ...msg.data, isMine: false };
          setMessages(prev => [...prev, receivedMsg]);
          if (activeTab !== 'chat') {
            setUnreadCount(prev => prev + 1);
            showToast(`New message: ${receivedMsg.text.substring(0, 20)}...`);
          }
        } else if (msg.type === 'draw') {
          handleRemoteDraw(msg.data);
        } else if (msg.type === 'wbClear') {
          clearCanvasLocal();
          showToast('Whiteboard cleared by peer');
        } else if (msg.type === 'handRaise') {
          setRemoteHandRaised(msg.data);
          if (msg.data) showToast('Peer raised their hand ✋');
        } else if (msg.type === 'reaction') {
          addReaction(msg.data);
        }
      } catch (e) {
        console.error('Data parse error', e);
      }
    });
  };

  // --- Device Enumeration ---
  const updateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices);
      const video = allDevices.find(d => d.kind === 'videoinput');
      const audio = allDevices.find(d => d.kind === 'audioinput');
      if (video && !selectedVideoId) setSelectedVideoId(video.deviceId);
      if (audio && !selectedAudioId) setSelectedAudioId(audio.deviceId);
    } catch (e) {
      console.error('Error listing devices', e);
    }
  }, [selectedVideoId, selectedAudioId]);

  useEffect(() => {
    updateDevices();
    navigator.mediaDevices.ondevicechange = updateDevices;
  }, [updateDevices]);

  // --- Speaker Detection ---
  useEffect(() => {
    if (!isCallActive || !remoteVideoRef.current?.srcObject) {
      audioContextRef.current?.close();
      audioContextRef.current = null;
      setIsRemoteSpeaking(false);
      return;
    }

    const stream = remoteVideoRef.current.srcObject as MediaStream;
    if (stream.getAudioTracks().length === 0) return;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationFrameId: number;
    const checkVolume = () => {
      if (!audioContextRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setIsRemoteSpeaking(average > 35);
      animationFrameId = requestAnimationFrame(checkVolume);
    };
    checkVolume();

    return () => {
      cancelAnimationFrame(animationFrameId);
      audioContext.close();
    };
  }, [isCallActive]);

  // --- Call Logic ---
  const startCall = async (targetId: string) => {
    if (!targetId || targetId.length !== 4) {
      showToast('Enter a valid 4-digit ID', 'error');
      return;
    }
    if (targetId === myId) {
      showToast('Cannot call yourself', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true, 
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true 
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const call = peerRef.current!.call(targetId, stream);
      setupCall(call);
      
      const conn = peerRef.current!.connect(targetId, { reliable: true });
      setupDataConnection(conn);
      
      setIsCallActive(true);
      setCallStatus(`Calling ${targetId}...`);
    } catch (err) {
      showToast('Camera/Mic access denied or device not found', 'error');
    }
  };

  const setupCall = (call: MediaConnection) => {
    currentCallRef.current = call;
    call.on('stream', (remoteStream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      setCallStatus('Connected');
      startTimer();
      showToast('Peer joined the call', 'success');
    });
    call.on('close', () => {
      showToast('Peer left the call', 'info');
      endCall();
    });
    call.on('error', () => {
      showToast('Call failed', 'error');
      endCall();
    });
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    setIncomingCall(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true, 
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true 
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      incomingCall.answer(stream);
      setupCall(incomingCall);
      setIsCallActive(true);
      setCallStatus('Connecting...');
      
      // Also connect data if not already
      if (!dataConnRef.current) {
        const conn = peerRef.current!.connect(incomingCall.peer, { reliable: true });
        setupDataConnection(conn);
      }
    } catch (err) {
      showToast('Camera/Mic access denied', 'error');
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    setIsMiniMode(false);
    setIsScreenSharing(false);
    setIsRecording(false);
    setIsHandRaised(false);
    setRemoteHandRaised(false);
    currentCallRef.current?.close();
    currentCallRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    stopTimer();
    setCallTimer('0:00');
    setCallStatus('Idle');
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
  };

  const startTimer = () => {
    const startTime = Date.now();
    callTimerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      setCallTimer(`${m}:${String(s).padStart(2, '0')}`);
    }, 1000);
  };

  const stopTimer = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (currentCallRef.current) {
          const sender = currentCallRef.current.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        
        screenTrack.onended = () => stopScreenShare();
        setIsScreenSharing(true);
        showToast('Screen sharing started');
      } catch (e) {
        console.error('Screen share error', e);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentCallRef.current && videoTrack) {
        const sender = currentCallRef.current.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    }
    setIsScreenSharing(false);
    showToast('Screen sharing stopped');
  };

  const toggleHandRaise = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    dataConnRef.current?.send(JSON.stringify({ type: 'handRaise', data: newState }));
  };

  const addReaction = (emoji: string) => {
    const id = Date.now();
    setReactions(prev => [...prev, { id, emoji }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 3000);
  };

  const sendReaction = (emoji: string) => {
    addReaction(emoji);
    dataConnRef.current?.send(JSON.stringify({ type: 'reaction', data: emoji }));
  };

  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      const stream = remoteVideoRef.current?.srcObject as MediaStream;
      if (!stream) return;
      
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${new Date().toISOString()}.webm`;
        a.click();
        showToast('Recording saved locally', 'success');
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      showToast('Recording started');
    }
  };

  // --- Chat Logic ---
  const handleAddContact = () => {
    if (newContactName && newContactId && newContactId.length === 4) {
      const newContacts = [...contacts, { name: newContactName, id: newContactId }];
      setContacts(newContacts);
      localStorage.setItem('vc_contacts', JSON.stringify(newContacts));
      setShowAddContact(false);
      setNewContactName('');
      setNewContactId('');
      showToast('Peer added successfully', 'success');
    } else {
      showToast('Please enter a valid name and 4-digit ID', 'error');
    }
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || !dataConnRef.current) return;
    const msg: Message = {
      id: Date.now().toString(),
      text,
      time: nowTime(),
      isMine: true,
      from: 'me'
    };
    setMessages(prev => [...prev, msg]);
    dataConnRef.current.send(JSON.stringify({ type: 'chat', data: msg }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Whiteboard Logic ---
  const handleRemoteDraw = (data: DrawEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
    ctx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const clearCanvasLocal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const clearCanvas = () => {
    clearCanvasLocal();
    dataConnRef.current?.send(JSON.stringify({ type: 'wbClear' }));
  };

  // --- UI Components ---
  const SidebarItem = ({ id, icon: Icon, label, badge }: { id: Tab; icon: any; label: string; badge?: number }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => { 
          console.log(`Switching to tab: ${id}`);
          setActiveTab(id); 
          if (id === 'chat') setUnreadCount(0); 
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 w-full py-4 transition-all duration-200 group",
          isActive ? "text-brand-500" : "text-text-secondary hover:text-text-primary"
        )}
      >
        <div className={cn(
          "p-2 rounded-xl transition-colors",
          isActive ? "bg-brand-500/10" : "group-hover:bg-bg-elevated"
        )}>
          <Icon size={24} />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
        {badge ? (
          <span className="absolute top-3 right-4 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-bg-surface">
            {badge}
          </span>
        ) : null}
        {isActive && (
          <motion.div 
            layoutId="activeTab"
            className="absolute left-0 w-1 h-8 bg-brand-500 rounded-r-full"
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden select-none bg-bg-base">
      {/* Sidebar (Desktop) / Bottom Nav (Mobile) */}
      <aside className="hidden md:flex flex-col w-20 bg-bg-surface border-r border-border-subtle z-20">
        <div className="flex items-center justify-center h-20">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Video className="text-white" size={20} />
          </div>
        </div>
        <nav className="flex-1 flex flex-col items-center py-4">
          <SidebarItem id="calls" icon={Phone} label="Calls" />
          <SidebarItem id="chat" icon={MessageSquare} label="Chat" badge={unreadCount} />
          <SidebarItem id="board" icon={PenTool} label="Board" />
          <SidebarItem id="contacts" icon={Users} label="Peers" />
          <SidebarItem id="help" icon={HelpCircle} label="Help" />
        </nav>
        <div className="p-4 flex flex-col gap-4 items-center">
          <div className="w-8 h-8 rounded-full bg-slate-200 border border-border-subtle flex items-center justify-center text-[10px] font-bold text-slate-500">
            {myId ? myId[0] : '?'}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-bg-surface border-b border-border-subtle backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-text-primary md:hidden">VideoCall Pro</h1>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-border-subtle rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your ID</span>
              <span className="font-mono text-brand-500 font-bold tracking-widest">{myId || '----'}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(myId);
                  showToast('ID copied to clipboard', 'success');
                }}
                className="ml-2 text-slate-400 hover:text-slate-600"
                title="Copy ID"
              >
                <Copy size={14} />
              </button>
              <button 
                onClick={() => {
                  const url = `${window.location.origin}?call=${myId}`;
                  navigator.clipboard.writeText(url);
                  showToast('Invite link copied!', 'success');
                }}
                className="ml-1 text-slate-400 hover:text-slate-600"
                title="Copy Invite Link"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", myId ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-400")} />
              <span className="text-xs font-medium text-slate-500">{myId ? 'Online' : 'Connecting...'}</span>
            </div>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-500 hover:text-slate-700"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Content Switcher */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'calls' && (
              <motion.div 
                key="calls"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold text-text-primary">Start a Conversation</h2>
                  <p className="text-slate-500">Enter a 4-digit ID to connect instantly with high-quality video.</p>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded-3xl p-8 shadow-sm">
                  <div className="flex flex-col items-center gap-8">
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-indigo-500 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
                      <input 
                        type="text" 
                        placeholder="0000"
                        maxLength={4}
                        className="relative w-64 h-24 bg-slate-50 border-2 border-border-subtle rounded-2xl text-center text-5xl font-mono font-bold tracking-[1rem] text-text-primary focus:border-brand-500 focus:outline-none transition-all"
                        onChange={(e) => e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)}
                        id="dialer-input"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const val = (document.getElementById('dialer-input') as HTMLInputElement).value;
                        startCall(val);
                      }}
                      className="w-full max-w-xs py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-brand-500/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                      <Phone size={24} />
                      Start Video Call
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-bg-surface border border-border-subtle rounded-3xl p-6 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                        <Monitor size={24} />
                      </div>
                      <h3 className="font-bold text-text-primary">Watch Together</h3>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">Sync YouTube videos with your peer in real-time.</p>
                    <div className="flex gap-2">
                      <input type="text" placeholder="YouTube Link..." className="flex-1 bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 text-text-primary" />
                      <button className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600"><Play size={18} /></button>
                    </div>
                  </div>
                  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                        <Sparkles size={24} />
                      </div>
                      <h3 className="font-bold text-text-primary">AI Summary</h3>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">Get a quick recap of your chat history using Claude AI.</p>
                    <button className="text-sm font-bold text-brand-500 hover:text-brand-600 flex items-center gap-1">
                      Learn more <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col max-w-4xl mx-auto bg-bg-surface border border-border-subtle rounded-3xl overflow-hidden shadow-sm"
              >
                <div className="p-4 border-b border-border-subtle/50 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary">Live Chat</h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                        {dataConnRef.current ? 'Connected' : 'Waiting for connection'}
                      </p>
                    </div>
                  </div>
                  <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                    <MoreVertical size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                      <div className="p-6 bg-bg-surface/50 rounded-full">
                        <MessageSquare size={48} className="opacity-20" />
                      </div>
                      <p className="text-sm">No messages yet. Start a call to chat!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={cn("flex flex-col", msg.isMine ? "items-end" : "items-start")}>
                        <div className={cn(
                          "max-w-[80%] px-4 py-2 rounded-xl text-sm shadow-sm",
                          msg.isMine 
                            ? "bg-brand-500 text-white rounded-tr-none" 
                            : "bg-bg-surface text-text-primary border border-slate-100 rounded-tl-none"
                        )}>
                          {msg.text}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] text-slate-500 font-medium">{msg.time}</span>
                            {msg.isMine && <Check size={12} className="text-brand-500" />}
                          </div>
                        </div>
                        {!msg.isMine && (
                          <button className="mt-1 text-[10px] text-brand-600 hover:underline font-bold flex items-center gap-0.5">
                            <Languages size={10} /> Translate
                          </button>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-bg-surface border-t border-border-subtle/50">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 bg-slate-50 border border-border-subtle rounded-xl px-4 py-2.5 focus-within:shadow-sm transition-all">
                      <textarea 
                        placeholder="Type a message..."
                        className="w-full bg-transparent border-none focus:outline-none text-sm text-text-primary resize-none max-h-32"
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const val = e.currentTarget.value;
                            sendMessage(val);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const el = document.querySelector('textarea') as HTMLTextAreaElement;
                        sendMessage(el.value);
                        el.value = '';
                      }}
                      className="p-3 bg-brand-500 hover:bg-brand-600 text-white rounded-full shadow-md transition-all active:scale-95"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'board' && (
              <motion.div 
                key="board"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-bg-surface dark:bg-bg-surface border border-border-subtle dark:border-border-subtle rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setWbTool('draw')}
                      className={cn("p-2 rounded-lg transition-colors", wbTool === 'draw' ? "bg-brand-500 text-white" : "text-slate-500 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-bg-elevated")}
                    >
                      <PenTool size={20} />
                    </button>
                    <button 
                      onClick={() => setWbTool('erase')}
                      className={cn("p-2 rounded-lg transition-colors", wbTool === 'erase' ? "bg-brand-500 text-white" : "text-slate-500 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-bg-elevated")}
                    >
                      <Eraser size={20} />
                    </button>
                    <div className="w-px h-6 bg-slate-200 dark:bg-border-subtle mx-2" />
                    <div className="flex items-center gap-1.5">
                      {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#111b21'].map(color => (
                        <button 
                          key={color}
                          onClick={() => setWbColor(color)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-transform",
                            wbColor === color ? "border-slate-400 dark:border-[#e9edef] scale-110" : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase">Size</span>
                      <input 
                        type="range" 
                        min="1" max="20" 
                        value={wbSize}
                        onChange={(e) => setWbSize(parseInt(e.target.value))}
                        className="w-24 accent-brand-500"
                      />
                    </div>
                    <button 
                      onClick={clearCanvas}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-bg-elevated hover:bg-rose-500/10 hover:text-rose-500 text-slate-500 dark:text-text-secondary rounded-lg text-xs font-bold transition-all"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-bg-surface dark:bg-bg-surface rounded-3xl overflow-hidden shadow-sm border border-border-subtle dark:border-border-subtle cursor-crosshair relative">
                  <canvas 
                    ref={canvasRef}
                    className="w-full h-full"
                    onMouseDown={(e) => {
                      isDrawingRef.current = true;
                      const rect = canvasRef.current!.getBoundingClientRect();
                      lastPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                    }}
                    onMouseMove={(e) => {
                      if (!isDrawingRef.current) return;
                      const canvas = canvasRef.current!;
                      const ctx = canvas.getContext('2d')!;
                      const rect = canvas.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
 
                      ctx.beginPath();
                      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
                      ctx.lineTo(x, y);
                      ctx.strokeStyle = wbTool === 'erase' ? '#ffffff' : wbColor;
                      ctx.lineWidth = wbSize;
                      ctx.lineCap = 'round';
                      ctx.lineJoin = 'round';
                      ctx.stroke();
 
                      dataConnRef.current?.send(JSON.stringify({
                        type: 'draw',
                        data: {
                          x0: lastPosRef.current.x / canvas.width,
                          y0: lastPosRef.current.y / canvas.height,
                          x1: x / canvas.width,
                          y1: y / canvas.height,
                          color: wbTool === 'erase' ? '#ffffff' : wbColor,
                          size: wbSize
                        }
                      }));
 
                      lastPosRef.current = { x, y };
                    }}
                    onMouseUp={() => isDrawingRef.current = false}
                    onMouseLeave={() => isDrawingRef.current = false}
                  />
                  {!dataConnRef.current && (
                    <div className="absolute inset-0 bg-slate-100/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                      <div className="bg-bg-surface/90 dark:bg-bg-surface/90 border border-border-subtle dark:border-border-subtle px-4 py-2 rounded-full shadow-sm">
                        <p className="text-xs font-bold text-slate-500 dark:text-text-secondary">Connect to a peer to sync whiteboard</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'contacts' && (
              <motion.div 
                key="contacts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-text-primary dark:text-text-primary">Saved Peers</h2>
                  <button 
                    onClick={() => setShowAddContact(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                  >
                    <Plus size={18} /> Add Peer
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contacts.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-4 bg-bg-surface dark:bg-bg-surface border border-dashed border-border-subtle dark:border-border-subtle rounded-3xl">
                      <Users size={48} className="mx-auto text-slate-300 dark:text-slate-700" />
                      <p className="text-slate-500">No peers saved yet. Add your friends to call them easily.</p>
                    </div>
                  ) : (
                    contacts.map((contact, idx) => (
                      <div key={idx} className="bg-bg-surface dark:bg-bg-surface border border-border-subtle dark:border-border-subtle p-4 rounded-2xl flex items-center justify-between group hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-bg-base dark:bg-bg-base flex items-center justify-center text-lg font-bold text-slate-500 dark:text-text-secondary group-hover:bg-brand-500/10 group-hover:text-brand-500 transition-colors">
                            {contact.name[0].toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-text-primary dark:text-text-primary">{contact.name}</h4>
                            <p className="font-mono text-xs text-slate-500 tracking-widest">{contact.id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => startCall(contact.id)}
                            className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-all"
                          >
                            <Phone size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              const newContacts = contacts.filter((_, i) => i !== idx);
                              setContacts(newContacts);
                              localStorage.setItem('vc_contacts', JSON.stringify(newContacts));
                            }}
                            className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'help' && (
              <motion.div 
                key="help"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-3xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold text-text-primary">How it Works</h2>
                  <p className="text-slate-500">Secure, peer-to-peer communication simplified.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-bg-surface border border-border-subtle p-6 rounded-3xl space-y-4 shadow-sm">
                    <div className="w-12 h-12 bg-brand-500/10 text-brand-500 rounded-2xl flex items-center justify-center">
                      <LayoutGrid size={24} />
                    </div>
                    <h3 className="font-bold text-text-primary text-lg">4-Digit IDs</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Instead of complex usernames or links, we use simple 4-digit IDs. Your ID is unique and persists across sessions on this device.
                    </p>
                  </div>
                  <div className="bg-bg-surface border border-border-subtle p-6 rounded-3xl space-y-4 shadow-sm">
                    <div className="w-12 h-12 bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center">
                      <Monitor size={24} />
                    </div>
                    <h3 className="font-bold text-text-primary text-lg">Peer-to-Peer</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Your video and audio streams go directly to your peer. We don't store or see your conversations. It's private by design.
                    </p>
                  </div>
                </div>

                <div className="bg-bg-surface border border-border-subtle p-8 rounded-3xl shadow-sm">
                  <h3 className="font-bold text-text-primary mb-6 flex items-center gap-2">
                    <Settings size={20} className="text-slate-400" /> Advanced Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-bg-base rounded-2xl border border-border-subtle">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary">Background Blur (Local)</h4>
                        <p className="text-xs text-slate-500">Toggle the application theme</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-surface dark:bg-bg-surface border-t border-border-subtle dark:border-border-subtle flex items-center justify-around z-20">
        <SidebarItem id="calls" icon={Phone} label="Calls" />
        <SidebarItem id="chat" icon={MessageSquare} label="Chat" badge={unreadCount} />
        <SidebarItem id="board" icon={PenTool} label="Board" />
        <SidebarItem id="contacts" icon={Users} label="Peers" />
      </nav>

      {/* --- Overlay Components --- */}

      {/* Incoming Call Modal */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-bg-surface dark:bg-bg-surface border border-border-subtle dark:border-border-subtle rounded-[2.5rem] p-10 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="relative mx-auto w-24 h-24 mb-6">
                <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
                <div className="relative w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Phone className="text-white" size={40} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-text-primary dark:text-text-primary mb-2">Incoming Call</h2>
              <p className="text-slate-500 mb-8">Peer <span className="font-mono font-bold text-brand-500">{incomingCall.peer}</span> is calling you.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => { setIncomingCall(null); incomingCall.close(); }}
                  className="flex-1 py-4 bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white rounded-2xl font-bold transition-all"
                >
                  Decline
                </button>
                <button 
                  onClick={acceptCall}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Call Screen */}
      <AnimatePresence>
        {isCallActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed z-[1000] bg-slate-950 transition-all duration-500 ease-in-out overflow-hidden",
              isMiniMode 
                ? "bottom-20 right-4 w-64 h-48 rounded-3xl shadow-2xl border border-border-subtle dark:border-border-subtle" 
                : "inset-0"
            )}
          >
            {/* Video Area */}
            <div className="relative w-full h-full">
              <div className={cn(
                "w-full h-full transition-all duration-500",
                isPinned ? "scale-95 opacity-50 blur-sm" : "scale-100 opacity-100"
              )}>
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className={cn(
                    "w-full h-full object-cover transition-all duration-300",
                    isRemoteSpeaking && !isPinned ? "ring-4 ring-brand-500 ring-inset" : ""
                  )}
                />
                {/* Remote Avatar (when peer video is off - simulated as we don't have peer state for cam) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
                   <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-slate-400">
                     P
                   </div>
                </div>
              </div>

              <div className={cn(
                "absolute transition-all duration-500 overflow-hidden",
                isPinned 
                  ? "inset-0 z-10" 
                  : isMiniMode 
                    ? "bottom-2 right-2 w-20 h-28 rounded-xl z-20" 
                    : "bottom-24 right-6 w-32 h-44 md:w-48 md:h-64 rounded-2xl z-20"
              )}>
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className={cn(
                    "w-full h-full object-cover border-2 border-white/20 shadow-xl transition-all",
                    isCamOff ? "opacity-0" : "opacity-100",
                    isBlurEnabled ? "blur-md scale-110" : ""
                  )}
                />
                {isCamOff && (
                  <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-brand-500/20 flex items-center justify-center text-2xl font-bold text-brand-500">
                      {myId ? myId[0] : 'M'}
                    </div>
                  </div>
                )}
                <button 
                  onClick={() => setIsPinned(!isPinned)}
                  className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Maximize2 size={14} />
                </button>
              </div>

              {/* Floating Reactions */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <AnimatePresence>
                  {reactions.map(r => (
                    <motion.div
                      key={r.id}
                      initial={{ y: '100%', x: `${40 + Math.random() * 20}%`, opacity: 0, scale: 0.5 }}
                      animate={{ y: '-20%', opacity: [0, 1, 1, 0], scale: [0.5, 1.5, 1.5, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 3, ease: "easeOut" }}
                      className="absolute text-4xl"
                    >
                      {r.emoji}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Overlay Info */}
              {!isMiniMode && (
                <div className="absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-black/40 to-transparent pointer-events-none flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-white/80 uppercase tracking-widest">{callStatus}</span>
                    <span className="text-3xl font-mono font-medium text-white tracking-wider">{callTimer}</span>
                  </div>
                  <div className="flex gap-2 pointer-events-auto">
                    {remoteHandRaised && (
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="bg-brand-500 text-white p-2 rounded-xl shadow-lg flex items-center gap-2"
                      >
                        <Hand size={20} />
                        <span className="text-xs font-bold">Peer raised hand</span>
                      </motion.div>
                    )}
                    {isHandRaised && (
                      <div className="bg-white/10 backdrop-blur-md text-white p-2 rounded-xl border border-white/20 flex items-center gap-2">
                        <Hand size={20} />
                        <span className="text-xs font-bold">Hand raised</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Call Controls */}
              {!isMiniMode ? (
                <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col items-center gap-6 bg-gradient-to-t from-black/40 to-transparent">
                  {/* Reaction Bar */}
                  <div className="flex gap-2 p-2 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10">
                    {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                      <button 
                        key={emoji}
                        onClick={() => sendReaction(emoji)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-all text-xl active:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-center items-center gap-4">
                    <button 
                      onClick={toggleMic}
                      className={cn(
                        "p-4 rounded-full backdrop-blur-md transition-all",
                        isMuted ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    <button 
                      onClick={toggleCam}
                      className={cn(
                        "p-4 rounded-full backdrop-blur-md transition-all",
                        isCamOff ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                    >
                      {isCamOff ? <VideoOff size={24} /> : <Video size={24} />}
                    </button>
                    
                    <button 
                      onClick={toggleScreenShare}
                      className={cn(
                        "p-4 rounded-full backdrop-blur-md transition-all",
                        isScreenSharing ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title="Share Screen"
                    >
                      <MonitorUp size={24} />
                    </button>

                    <button 
                      onClick={toggleHandRaise}
                      className={cn(
                        "p-4 rounded-full backdrop-blur-md transition-all",
                        isHandRaised ? "bg-brand-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title="Raise Hand"
                    >
                      <Hand size={24} />
                    </button>

                    <button 
                      onClick={toggleRecording}
                      className={cn(
                        "p-4 rounded-full backdrop-blur-md transition-all",
                        isRecording ? "bg-rose-500 text-white animate-pulse" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title={isRecording ? "Stop Recording" : "Start Recording"}
                    >
                      {isRecording ? <CircleStop size={24} /> : <Download size={24} />}
                    </button>

                    <button 
                      onClick={endCall}
                      className="p-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-lg shadow-rose-500/30 transition-all active:scale-95"
                      title="End Call"
                    >
                      <PhoneOff size={28} />
                    </button>
                    
                    <button 
                      onClick={() => setIsMiniMode(true)}
                      className="p-4 bg-white/10 text-white hover:bg-white/20 rounded-full backdrop-blur-md transition-all"
                      title="Minimize"
                    >
                      <Minimize2 size={24} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 group cursor-pointer" onClick={() => setIsMiniMode(false)}>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="text-white" size={32} />
                  </div>
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-full">
                    <span className="text-[10px] font-mono text-white">{callTimer}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); endCall(); }}
                    className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddContact && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[2000] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-[2rem] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-[#111b21]">Add New Peer</h2>
                <button onClick={() => setShowAddContact(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Peer Name</label>
                  <input 
                    type="text" 
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#111b21] focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">4-Digit ID</label>
                  <input 
                    type="text" 
                    value={newContactId}
                    onChange={(e) => setNewContactId(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    maxLength={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#111b21] focus:outline-none focus:border-brand-500 font-mono tracking-widest"
                  />
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleAddContact}
                    className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20"
                  >
                    Save Contact
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[2000] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-bg-surface dark:bg-bg-surface border border-border-subtle dark:border-border-subtle rounded-[2rem] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-primary">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-bg-surface rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Camera size={14} /> Camera
                  </label>
                  <select 
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full bg-slate-50 border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-brand-500"
                  >
                    {devices.filter(d => d.kind === 'videoinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Mic2 size={14} /> Microphone
                  </label>
                  <select 
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    className="w-full bg-slate-50 border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-brand-500"
                  >
                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Sparkles size={14} /> Privacy
                  </label>
                  <div className="flex items-center justify-between p-4 bg-slate-50 border border-border-subtle rounded-xl">
                    <span className="text-sm font-medium text-text-primary">Background Blur (Local)</span>
                    <button 
                      onClick={() => setIsBlurEnabled(!isBlurEnabled)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        isBlurEnabled ? "bg-brand-500" : "bg-slate-300"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        isBlurEnabled ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/20"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-6 left-1/2 z-[10000] px-6 py-3 rounded-full shadow-lg flex items-center gap-3 border backdrop-blur-md",
              toast.type === 'success' ? "bg-emerald-500/90 border-emerald-400/50 text-white" :
              toast.type === 'error' ? "bg-rose-500/90 border-rose-400/50 text-white" :
              "bg-white/90 border-slate-200 text-[#111b21]"
            )}
          >
            {toast.type === 'success' && <Check size={18} />}
            {toast.type === 'error' && <X size={18} />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
