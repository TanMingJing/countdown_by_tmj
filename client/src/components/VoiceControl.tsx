import React, { useEffect, useState, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { socket } from '../socket';
import { Mic, MicOff, Phone, PhoneOff, Headphones, VolumeX } from 'lucide-react';

interface VoiceControlProps {
  roomId: string;
}

export const VoiceControl: React.FC<VoiceControlProps> = ({ roomId }) => {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const userStream = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ peerID: string; peer: SimplePeer.Instance }[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  useEffect(() => {
    // Clean up on unmount
    return () => {
      leaveVoice();
    };
  }, []);

  const joinVoice = () => {
    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      .then(stream => {
        userStream.current = stream;
        setIsInVoice(true);
        setIsMuted(false);

        socket.emit('join_voice', roomId);

        socket.on('user_joined_voice', (userId: string) => {
          const peer = createPeer(userId, stream);
          peersRef.current.push({
            peerID: userId,
            peer,
          });
        });

        socket.on('user_left_voice', (userId: string) => {
            const peerObj = peersRef.current.find(p => p.peerID === userId);
            if(peerObj) {
                peerObj.peer.destroy();
            }
            const newPeers = peersRef.current.filter(p => p.peerID !== userId);
            peersRef.current = newPeers;
            setPeers(newPeers.map(p => p.peer));
          // Remove remote stream for that user
          setRemoteStreams(prev => {
            const copy = { ...prev };
            delete copy[userId];
            return copy;
          });
        });

        socket.on('signal', (payload: { senderId: string; signalData: SimplePeer.SignalData }) => {
          const item = peersRef.current.find(p => p.peerID === payload.senderId);
          if (item) {
            item.peer.signal(payload.signalData);
          } else {
             // Incoming call (answer)
             const peer = addPeer(payload.signalData, payload.senderId, stream);
             peersRef.current.push({
                peerID: payload.senderId,
                peer,
             })
          }
        });
      })
      .catch(err => {
        console.error('Failed to get local stream', err);
        alert('无法访问麦克风，请检查权限设置。');
      });
  };

  const createPeer = (userToSignal: string, stream: MediaStream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('signal', { targetId: userToSignal, signalData: signal });
    });

    // When remote stream arrives, store it keyed by the remote socket id
    peer.on('stream', (remoteStream: MediaStream) => {
      setRemoteStreams(prev => ({ ...prev, [userToSignal]: remoteStream }));
    });

    return peer;
  };

  const addPeer = (incomingSignal: SimplePeer.SignalData, callerID: string, stream: MediaStream) => {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('signal', { targetId: callerID, signalData: signal });
    });

    peer.on('stream', (remoteStream: MediaStream) => {
      setRemoteStreams(prev => ({ ...prev, [callerID]: remoteStream }));
    });

    peer.signal(incomingSignal);

    return peer;
  };

  const leaveVoice = () => {
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => track.stop());
      userStream.current = null;
    }

    socket.emit('leave_voice', roomId);
    socket.off('user_joined_voice');
    socket.off('signal');
    socket.off('user_left_voice');

      peersRef.current.forEach(({ peer }) => peer.destroy());    
      peersRef.current = [];    
    setRemoteStreams({});
    setIsInVoice(false);
  };

  const toggleMute = () => {
    if (userStream.current) {
      userStream.current.getAudioTracks()[0].enabled = !userStream.current.getAudioTracks()[0].enabled;
      setIsMuted(!userStream.current.getAudioTracks()[0].enabled);
    }
  };

  const toggleDeafen = () => {
    setIsDeafened(!isDeafened);
  };

  return (
    <div className="flex items-center gap-2">
        {/* Hidden audio elements for peers (render remote streams) */}
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <AudioPlayer key={id} stream={stream} isDeafened={isDeafened} />
        ))}

      {isInVoice ? (
        <>
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-all ${
              isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-700/50 hover:bg-slate-600/50 text-white'
            }`}
            title={isMuted ? "取消静音" : "静音"}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            onClick={toggleDeafen}
            className={`p-3 rounded-full transition-all ${
              isDeafened ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-700/50 hover:bg-slate-600/50 text-white'
            }`}
            title={isDeafened ? "取消闭听筒" : "闭听筒"}
          >
            {isDeafened ? <VolumeX size={20} /> : <Headphones size={20} />}
          </button>
          <button
            onClick={leaveVoice}
            className="p-3 bg-red-600 hover:bg-red-500 rounded-full text-white transition-all"
            title="退出语音"
          >
            <PhoneOff size={20} />
          </button>
        </>
      ) : (
        <button
          onClick={joinVoice}
          className="p-3 bg-green-600 hover:bg-green-500 rounded-full text-white transition-all shadow-lg shadow-green-900/20"
          title="加入语音"
        >
          <Phone size={20} />
        </button>
      )}
    </div>
  );
};

const AudioPlayer: React.FC<{ stream: MediaStream, isDeafened: boolean }> = ({ stream, isDeafened }) => {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (ref.current) {
      ref.current.muted = isDeafened;
    }
  }, [isDeafened]);

  return <audio playsInline autoPlay ref={ref} />;
};
