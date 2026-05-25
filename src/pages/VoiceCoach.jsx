import { useState, useEffect, useRef } from 'react';
import { 
  UserRoundCheck, Mic, Square, Settings, Video, VideoOff,
  Sparkles, AlertCircle, CheckCircle2,
  ChevronRight, RefreshCw, BarChart2, Award,
  Volume2, Play, Pause, Loader2, Upload
} from 'lucide-react';
import gsap from 'gsap';

// DANH SÁCH CÂU HỎI PHỎNG VẤN THỬ
const INTERVIEW_QUESTIONS = [
  { id: 1, category: "Hành Vi", question: "Hãy kể về một lần bạn gặp phải xung đột khó khăn trong nhóm. Bạn đã giải quyết nó như thế nào?" },
  { id: 2, category: "Lãnh Đạo", question: "Hãy mô tả một dự án bạn đã quản lý khi yêu cầu thay đổi đột ngột. Bạn đã thích ứng ra sao?" },
  { id: 3, category: "Kỹ Thuật", question: "Tại sao bạn muốn gia nhập tổ chức của chúng tôi, và điều gì làm cho bộ kỹ năng độc đáo của bạn là một mảnh ghép hoàn hảo?" },
  { id: 4, category: "Giải Quyết Vấn Đề", question: "Hãy kể về một thử thách kỹ thuật mà bạn đã gặp phải. Bạn đã làm thế nào để xác định nguyên nhân gốc rễ?" }
];

export default function VoiceCoach() {
  const [geminiKey, setGeminiKey] = useState(() => {
    const saved = localStorage.getItem('int_coach_gemini_key');
    if (saved && saved.trim() !== '') return saved;
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [sttProvider, setSttProvider] = useState(() => {
    const saved = localStorage.getItem('int_coach_stt');
    return saved && saved !== 'browser' ? saved : 'cloud';
  });
  
  // Navigation / View states
  const [activeView, setActiveView] = useState('practice'); // practice, report, settings
  const [showTopicDrawer, setShowTopicDrawer] = useState(false);

  // Video / Webcam stream Ref
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Question States
  const [activeQuestion, setActiveQuestion] = useState(INTERVIEW_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [isUsingCustom, setIsUsingCustom] = useState(false);

  // Recording / Interview States
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Sẵn sàng. Hãy chọn câu hỏi ở hộc kéo dưới, bật camera và nhấn Ghi âm để phỏng vấn thử!');
  
  // Scoring States
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [activeTab, setActiveTab] = useState('star'); // star, strengths, rewrite
  const [textInput, setTextInput] = useState('');

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const audioUploadRef = useRef(null);
  const recordingStartedAtRef = useRef(0);

  // Toggle Camera
  const toggleCamera = async () => {
    if (cameraActive) {
      stopCamera();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setStatusMsg('Camera đã được bật trong bong bóng hình tròn góc trên.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Không thể mở Camera. Vui lòng cấp quyền micro/camera.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const [isSTTSupported, setIsSTTSupported] = useState(true);
  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Browser STT Setup
  useEffect(() => {
    const hasSTT = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setIsSTTSupported(hasSTT);

    if (!hasSTT) {
      setSttProvider(prev => prev === 'browser' ? 'cloud' : prev);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'vi-VN'; // Vietnamese primary for Interview Coach

    rec.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(prev => (prev + ' ' + finalTranscript).trim());
      }
    };

    rec.onerror = (e) => {
      console.error('STT Error:', e);
      if (e.error === 'not-allowed') {
        setStatusMsg('Lỗi: Trình duyệt bị từ chối quyền truy cập Micro. Hãy cấp quyền truy cập thiết bị thu âm trong cài đặt trình duyệt để tiếp tục.');
      } else if (e.error === 'network') {
        setStatusMsg('Lỗi mạng: Không thể kết nối tới máy chủ Google Speech. Vui lòng kiểm tra internet.');
      } else if (e.error === 'no-speech') {
        console.warn('Không nghe thấy giọng nói phỏng vấn...');
      } else {
        setStatusMsg(`Lỗi nhận diện giọng nói: ${e.error}`);
      }
    };

    rec.onend = () => {
      // Auto-restart if we are still supposed to be recording
      if (isRecordingRef.current) {
        try {
          rec.start();
          console.log('SpeechRecognition auto-restarted.');
        } catch (err) {
          console.error('SpeechRecognition auto-restart failed:', err);
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      stopCamera();
      try {
        rec.stop();
      } catch {
        // Ignore cleanup errors when recognition was never started.
      }
    };
  }, []);

  // Timer Effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Save Settings
  const saveSettings = () => {
    const nextSttProvider = sttProvider === 'browser' ? 'cloud' : sttProvider;
    setSttProvider(nextSttProvider);
    localStorage.setItem('int_coach_gemini_key', geminiKey);
    localStorage.setItem('int_coach_stt', nextSttProvider);
    setStatusMsg('Cấu hình phỏng vấn đã được lưu.');
    setActiveView('practice');
  };

  // Entry Animations
  useEffect(() => {
    gsap.fromTo('.fade-in-element', 
      { opacity: 0, y: 15 }, 
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' }
    );
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getSupportedAudioMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    return [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
    ].find(type => MediaRecorder.isTypeSupported(type)) || '';
  };

  const getAudioExtension = (mimeType = '') => {
    if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm';
  };

  const stopRecorderTracks = () => {
    const stream = mediaRecorderRef.current?.stream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const createAudioRecorder = (stream) => {
    const mimeType = getSupportedAudioMimeType();
    if (mimeType) {
      try {
        return { recorder: new MediaRecorder(stream, { mimeType }), mimeType };
      } catch (err) {
        console.warn('Preferred MediaRecorder MIME failed, falling back:', err);
      }
    }
    return { recorder: new MediaRecorder(stream), mimeType: '' };
  };

  // Start Interview Recording
  const startRecording = async () => {
    isRecordingRef.current = true;
    setTranscript('');
    setAssessment(null);
    audioChunksRef.current = [];
    
    if (sttProvider === 'browser' && recognitionRef.current) {
      try {
        // CALL SYNCHRONOUSLY FIRST to guarantee Safari/iOS user interaction gesture is preserved
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Hệ thống đang nghe... Trả lời phỏng vấn một cách chuyên nghiệp.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Lỗi kích hoạt micro nhận diện giọng nói Web Speech. Hãy cấp quyền Micro trong trình duyệt.');
      }
    } else {
      // Cloud Whisper or Sandbox Simulator (uses standard MediaRecorder asynchronously)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMsg('Trình duyệt không hỗ trợ micro.');
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        setStatusMsg('Trình duyệt không hỗ trợ ghi âm. Hãy mở bằng Chrome hoặc Safari bản mới.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const { recorder, mimeType } = createAudioRecorder(stream);
        mediaRecorderRef.current = recorder;
        recordingStartedAtRef.current = Date.now();
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          if (!audioChunksRef.current.length) {
            stopRecorderTracks();
            setStatusMsg('Không thu được dữ liệu âm thanh. Hãy thử lại và kiểm tra quyền Micro.');
            return;
          }
          if (sttProvider === 'cloud') {
            setStatusMsg('Đang tải lên câu trả lời và nhận dạng tiếng Việt (Whisper)...');
            try {
              const recordedType = mediaRecorderRef.current?.mimeType || audioChunksRef.current[0]?.type || mimeType || 'audio/webm';
              const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
              const extension = getAudioExtension(recordedType);
              const duration = ((Date.now() - recordingStartedAtRef.current) / 1000).toFixed(1);
              const formData = new FormData();
              formData.append('file', audioBlob, `speech.${extension}`);
              formData.append('language', 'vi');
              formData.append('client_duration', duration);
              
              const response = await fetch('/v1/audio/transcriptions', {
                method: 'POST',
                body: formData
              });
              
              if (!response.ok) {
                throw new Error(`Lỗi nhận dạng: HTTP ${response.status}`);
              }
              
              const data = await response.json();
              if (data.error) {
                setStatusMsg(`Nhận dạng thất bại: ${data.error}`);
                stopRecorderTracks();
                return;
              }
              
              if (data.text) {
                setTranscript(data.text.trim());
                setStatusMsg('Nhận dạng giọng nói đám mây thành công!');
              } else {
                setStatusMsg('Không nhận diện được giọng nói. Vui lòng nói to rõ hơn.');
              }
            } catch (err) {
              console.error('Cloud STT Error:', err);
              setStatusMsg(`Lỗi Cloud STT: ${err.message || err}`);
            }
          } else {
            setStatusMsg('Đã ghi âm xong. Chờ phân tích...');
          }
          stopRecorderTracks();
        };
        mediaRecorderRef.current.start(1000);
        setIsRecording(true);
        setRecordingTime(0);
        if (sttProvider === 'cloud') {
          setStatusMsg('Đang ghi âm qua đám mây... Hãy bắt đầu trả lời phỏng vấn.');
        } else {
          setStatusMsg('Đang ghi âm (Mô phỏng Sandbox)... Hãy trả lời phỏng vấn, sau đó nhập văn bản.');
        }
      } catch (err) {
        console.error('MediaRecorder start error:', err);
        setStatusMsg('Lỗi bắt đầu ghi âm cơ học. Hãy cấp quyền truy cập Micro.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    
    if (sttProvider === 'browser' && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors when recognition is already inactive.
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData?.();
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore stop errors when recorder tracks were already released.
      }
    }
    
    if (sttProvider === 'cloud') {
      setStatusMsg('Đang dừng ghi âm và chuẩn bị tải lên...');
    } else {
      setStatusMsg('Đã kết thúc câu trả lời. Bấm "Chấm Điểm" để xem đánh giá STAR.');
    }
  };

  const handleAudioUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setTranscript('');
    setTextInput('');
    setAssessment(null);
    setIsUploadingAudio(true);
    setStatusMsg(`Đang tải file voice "${file.name}" lên để nhận dạng...`);

    try {
      const formData = new FormData();
      formData.append('file', file, file.name || 'uploaded-audio');
      formData.append('language', 'vi');
      formData.append('client_duration', '0');

      const response = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Lỗi nhận dạng: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        setStatusMsg(`Upload voice thất bại: ${data.error}`);
        return;
      }

      if (data.text) {
        setTranscript(data.text.trim());
        setStatusMsg('Upload voice và nhận dạng thành công!');
      } else {
        setStatusMsg('Không nhận diện được nội dung trong file voice.');
      }
    } catch (err) {
      console.error('Audio upload STT error:', err);
      setStatusMsg(`Upload voice thất bại: ${err.message || err}`);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const parseAIJsonResponse = (rawText) => {
    const text = String(rawText || '').trim();
    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = jsonMatch?.[1] || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      return JSON.parse(candidate);
    }
  };

  const toList = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [String(value)];
  };

  const categoryText = (category, fallback = 'AI chưa trả đủ dữ liệu cho mục này.') => {
    if (!category) return fallback;
    return [
      ...toList(category.feedback),
      ...toList(category.strengths).map(item => `Điểm mạnh: ${item}`),
      ...toList(category.weaknesses).map(item => `Cần cải thiện: ${item}`),
    ].join(' ') || fallback;
  };

  const normalizeInterviewAssessment = (raw) => {
    const categories = raw.categories && typeof raw.categories === 'object' ? raw.categories : {};
    const categoryValues = Object.values(categories);
    const strengths = categoryValues.flatMap(item => toList(item?.strengths));
    const weaknesses = categoryValues.flatMap(item => toList(item?.weaknesses));
    const feedback = categoryValues.flatMap(item => toList(item?.feedback));
    const improvements = toList(raw.top_5_improvements).length
      ? toList(raw.top_5_improvements)
      : [...weaknesses, ...feedback].slice(0, 5);

    return {
      ...raw,
      overall_score: raw.overall_score ?? raw.score ?? 'N/A',
      estimated_readiness: raw.estimated_readiness || raw.hiring_recommendation || 'Đã có đánh giá',
      brutally_honest_summary: raw.brutally_honest_summary || raw.summary || 'AI đã chấm xong nhưng chưa trả nhận xét tổng quan.',
      star_method_analysis: raw.star_method_analysis || {
        situation: categoryText(categories.content_quality, 'Cần mở bối cảnh rõ hơn để người phỏng vấn hiểu tình huống.'),
        task: categoryText(categories.job_fit || categories.behavioral_competencies, 'Cần nói rõ vai trò, trách nhiệm và mục tiêu của bạn.'),
        action: categoryText(categories.communication_skills || categories.professionalism, 'Cần mô tả hành động cụ thể, có cấu trúc và chuyên nghiệp hơn.'),
        result: categoryText(categories.confidence_presence, 'Cần chốt bằng kết quả đo được hoặc bài học cụ thể.'),
      },
      best_parts: toList(raw.best_parts).length ? toList(raw.best_parts) : strengths.slice(0, 5),
      areas_for_improvement: toList(raw.areas_for_improvement).length ? toList(raw.areas_for_improvement) : improvements,
      better_version: raw.better_version || raw.ideal_rewritten_answer || raw.natural_rewritten_answer || 'AI chưa trả bản viết lại mẫu cho câu trả lời này.',
    };
  };

  // Call AI Coaching API via Unified Router AI Endpoint for Interview
  const analyzeWithGemini = async (textToAnalyze) => {
    setIsLoading(true);
    setStatusMsg('Đang gửi dữ liệu đến AI Coach để chấm điểm STAR...');

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (geminiKey.trim()) {
        headers['Authorization'] = `Bearer ${geminiKey}`;
      }

      const response = await fetch(
        '/v1/chat/interview',
        {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            query: `Câu hỏi phỏng vấn: "${activeQuestion.question}"\nCâu trả lời của ứng viên: "${textToAnalyze}"`,
            task: 'interview'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`AI Coach Error: Status ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.answer;
      const parsed = normalizeInterviewAssessment(parseAIJsonResponse(rawText));
      setAssessment(parsed);
      setStatusMsg('Đã nhận phản hồi phân tích từ AI Coach.');
      setActiveView('report');
    } catch (err) {
      console.error(err);
      setStatusMsg(`Phân tích thất bại: ${err.message || err}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = () => {
    const textToAnalyze = transcript.trim() || textInput.trim();
    if (!textToAnalyze) {
      setStatusMsg('Vui lòng nhập văn bản hoặc ghi âm để bắt đầu.');
      return;
    }
    
    setActiveTab('star');
    setActiveView('report');
    analyzeWithGemini(textToAnalyze);
  };

  return (
    <div className="min-h-screen w-full bg-[#0D0D12] flex items-center justify-center font-sans p-0 sm:p-8 relative selection:bg-[#C9A84C] selection:text-[#0D0D12] overflow-hidden">
      {/* Global CSS noise overlay using inline SVG filter */}
      <div className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.05]" style={{ filter: 'url(#noiseFilter)' }}></div>
      <svg className="hidden">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        </filter>
      </svg>

      {/* Ambient glassmorphic blobs for desktop frame contrast */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#C9A84C]/10 blur-[120px] pointer-events-none hidden md:block"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-[#FAF8F5]/5 blur-[120px] pointer-events-none hidden md:block"></div>

      {/* Main Smartphone device shell mockup container (Midnight Luxe Accent) */}
      <div className="w-full h-screen sm:h-[844px] sm:w-[390px] sm:rounded-[3.2rem] sm:border-[10px] sm:border-neutral-900 sm:ring-4 sm:ring-neutral-800 bg-[#FAF8F5] sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] relative flex flex-col overflow-hidden text-[#0D0D12]">
        
        {/* iOS-Style Device Notch and Status Bar Components */}
        <div className="h-11 px-6 pt-3 flex justify-between items-center bg-[#FAF8F5]/90 backdrop-blur-md z-30 select-none text-[11px] font-mono text-[#0D0D12] font-bold shrink-0">
          <span>9:41</span>
          <div className="w-32 h-5 bg-black rounded-full absolute left-1/2 -translate-x-1/2 top-2.5 hidden sm:block"></div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L18.39 4.97C16.85 3.74 14.9 3 12 3zm6.03 3.39L4.97 18.03C6.51 19.26 8.46 20 12 20c4.97 0 9-4.03 9-9 0-2.12-.74-4.07-1.97-5.61z" />
            </svg>
            <span className="text-[9px]">5G</span>
            <div className="w-5 h-2.5 border border-[#0D0D12]/70 rounded-xs p-0.5 flex items-center">
              <div className="h-full w-3.5 bg-[#0D0D12] rounded-[1px]"></div>
            </div>
          </div>
        </div>

        {/* Small floating header */}
        <header className="flex justify-between items-center px-5 py-2.5 border-b border-[#FAF8F5]/10 bg-[#0D0D12] text-[#FAF8F5] z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#C9A84C] flex items-center justify-center text-[#0D0D12] shadow-xs">
              <UserRoundCheck size={16} className="stroke-[2.2px]" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight">Zenith Coach</h1>
              <p className="text-[8px] text-[#C9A84C] font-mono tracking-widest uppercase font-bold">Phòng Điều Hành Cao Cấp</p>
            </div>
          </div>

          <div className="px-2 py-0.5 rounded border border-[#C9A84C]/30 bg-[#FAF8F5]/10 text-[8px] text-[#C9A84C] font-mono font-bold">
            GEMINI AI GRADING
          </div>
        </header>

        {/* Dynamic View Panels */}
        <div className="flex-1 overflow-hidden relative">
          
          {/* A. PRACTICE PANEL */}
          {activeView === 'practice' && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              
              {/* Question display card */}
              <div className="bg-[#0D0D12] text-[#FAF8F5] p-5 rounded-[2.2rem] shadow-md relative overflow-hidden shrink-0">
                <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-[#C9A84C]/15 blur-lg"></div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#C9A84C] uppercase tracking-widest mb-1.5 font-bold">
                  <BarChart2 size={10} /> Bộ Câu Hỏi Phỏng Vấn
                </div>
                <h3 className="text-xs font-extrabold text-[#FAF8F5] mb-1">{isUsingCustom ? 'Câu hỏi tự do' : activeQuestion.category}</h3>
                <p className="text-xs font-serif italic text-white/95 leading-relaxed">
                  "{isUsingCustom ? (customQuestion || 'Nhập câu hỏi tự do phỏng vấn bên dưới...') : activeQuestion.question}"
                </p>
                
                <div className="flex items-center justify-between mt-3.5">
                  <button
                    onClick={() => setShowTopicDrawer(true)}
                    className="px-3 py-1.5 rounded-full bg-[#C9A84C] hover:bg-[#b09340] text-[#0D0D12] text-[9px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                  >
                    Đổi câu hỏi <ChevronRight size={10} />
                  </button>

                  <button
                    onClick={toggleCamera}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                      cameraActive 
                        ? 'bg-red-950/80 border-red-500/50 text-red-400 hover:bg-red-900/60' 
                        : 'bg-white/10 border-white/20 text-[#FAF8F5] hover:bg-white/20'
                    }`}
                  >
                    {cameraActive ? <VideoOff size={10} /> : <Video size={10} />}
                    {cameraActive ? 'Tắt Cam' : 'Bật Cam'}
                  </button>
                </div>
              </div>

              {/* Speech transcript output block with webcam bubble inside */}
              <div className="bg-white rounded-[2.2rem] border border-neutral-200 p-5 shadow-2xs flex-1 flex flex-col gap-3 min-h-[140px] relative overflow-hidden">
                <div className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold shrink-0">Bản ghi & Camera</div>
                
                {/* Webcam PiP bubble */}
                <div className="absolute top-4 right-4 w-20 h-20 rounded-full overflow-hidden border-2 border-[#C9A84C] shadow-lg z-20 bg-black flex items-center justify-center">
                  {cameraActive ? (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : (
                    <div className="text-center space-y-1 text-[#C9A84C]/50 flex flex-col items-center">
                      <VideoOff size={14} />
                      <span className="text-[6px] font-mono">TẮT</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto text-xs text-[#0D0D12] leading-relaxed pr-24 select-text">
                  {!isSTTSupported && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] leading-normal flex items-start gap-2 shrink-0">
                      <span className="text-amber-600 font-bold shrink-0">⚠️ LƯU Ý:</span>
                      <span>Trình duyệt hiện tại không hỗ trợ chuyển giọng nói thành văn bản trực tiếp (STT). Bạn hãy mở ứng dụng bằng Safari/Chrome gốc hoặc chuyển sang chế độ <b>"Gõ thủ công"</b> ở menu bánh răng phía dưới góc phải màn hình để tiếp tục luyện tập.</span>
                    </div>
                  )}
                  {transcript ? (
                    <p className="font-semibold">{transcript}</p>
                  ) : textInput && sttProvider !== 'browser' ? (
                    <p className="font-semibold">{textInput}</p>
                  ) : (
                    <p className="text-[#2A2A35]/60 italic pr-8">Câu trả lời phỏng vấn (STT tiếng Việt) của bạn sẽ hiển thị tại đây...</p>
                  )}
                </div>

                {(sttProvider === 'manual' || !isSTTSupported) && (
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Gõ trực tiếp câu trả lời của bạn tại đây để kiểm tra..."
                    className="w-full h-16 bg-[#FAF8F5] border border-neutral-200 rounded-2xl p-3 text-xs focus:outline-none focus:border-[#0D0D12] resize-none shrink-0"
                  />
                )}
              </div>

              {/* Siri Breathing Voice Capture interface widget */}
              <div className="flex flex-col items-center justify-center py-2 shrink-0 relative">
                <div className="relative flex items-center justify-center">
                  {isRecording && (
                    <>
                      <div className="absolute w-24 h-24 rounded-full bg-[#C9A84C]/20 animate-ping"></div>
                      <div className="absolute w-20 h-20 rounded-full bg-[#C9A84C]/30 animate-pulse"></div>
                    </>
                  )}
                  
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isUploadingAudio}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all transform cursor-pointer z-10 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isRecording 
                        ? 'bg-red-600 text-white hover:scale-95' 
                        : 'bg-[#0D0D12] hover:bg-black text-[#C9A84C] hover:scale-105'
                    }`}
                  >
                    {isRecording ? <Square size={18} fill="white" /> : <Mic size={22} />}
                  </button>
                </div>
                
                <p className="text-[9px] font-mono text-[#2A2A35]/70 mt-2 tracking-wide font-bold">
                  {isRecording ? `Ghi âm: ${formatTime(recordingTime)}` : 'NHẤN ĐỂ GHI ÂM CÂU TRẢ LỜI'}
                </p>
                <input
                  ref={audioUploadRef}
                  type="file"
                  accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => audioUploadRef.current?.click()}
                  disabled={isRecording || isUploadingAudio}
                  className="mt-2 h-8 px-3 rounded-xl border border-neutral-200 bg-white hover:bg-[#FAF8F5] text-[#0D0D12] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isUploadingAudio ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                  Upload voice
                </button>
              </div>

              {/* Action submission buttons */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleAnalyze}
                  disabled={isLoading || isRecording || isUploadingAudio}
                  className="w-full h-11 rounded-xl bg-[#0D0D12] hover:bg-black text-[#C9A84C] text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  Chấm Điểm Phỏng Vấn
                </button>
              </div>

              {/* Status log widget */}
              <p className="text-[9px] text-[#2A2A35]/70 font-mono leading-relaxed bg-[#FAF8F5] p-2.5 rounded-xl border border-neutral-200 shrink-0">
                {statusMsg}
              </p>
            </div>
          )}

          {activeView === 'report' && isLoading && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col items-center justify-center gap-4 text-center pb-24">
              <Loader2 className="animate-spin text-[#C9A84C]" size={36} />
              <h3 className="font-extrabold text-sm text-[#0D0D12]">AI Coach đang chấm điểm...</h3>
              <p className="text-[11px] text-[#2A2A35]/70 max-w-[240px] leading-relaxed">
                Đang phân tích cấu trúc STAR và tạo phản hồi phỏng vấn cho bạn.
              </p>
            </div>
          )}

          {activeView === 'report' && !isLoading && !assessment && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col items-center justify-center gap-4 text-center pb-24">
              <AlertCircle className="text-[#C9A84C]" size={34} />
              <h3 className="font-extrabold text-sm text-[#0D0D12]">Chưa có feedback</h3>
              <p className="text-[11px] text-[#2A2A35]/70 max-w-[250px] leading-relaxed">{statusMsg}</p>
              <button
                onClick={() => setActiveView('practice')}
                className="h-10 px-4 rounded-xl bg-[#0D0D12] text-[#C9A84C] text-xs font-bold"
              >
                Quay lại luyện tập
              </button>
            </div>
          )}

          {/* B. REPORT PANEL */}
          {activeView === 'report' && !isLoading && assessment && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              
              {/* High-fidelity summary scores card */}
              <div className="bg-[#0D0D12] text-[#FAF8F5] p-4 rounded-[2.2rem] flex justify-between items-center shrink-0 shadow-md">
                <div>
                  <h3 className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-widest font-bold">Ban Điều Hành Zenith</h3>
                  <p className="text-base font-extrabold text-[#FAF8F5]">Báo Cáo Điểm AI</p>
                </div>
                
                <div className="flex gap-2">
                  <div className="text-center bg-[#FAF8F5]/10 px-3 py-1.5 rounded-xl border border-white/10 shadow-2xs">
                    <p className="text-[8px] text-[#C9A84C] font-mono uppercase font-bold">ĐIỂM STAR</p>
                    <p className="text-sm font-extrabold text-white">{assessment.overall_score}</p>
                  </div>
                  <div className="text-center bg-[#FAF8F5]/10 px-3 py-1.5 rounded-xl border border-white/10 shadow-2xs">
                    <p className="text-[8px] text-[#C9A84C] font-mono uppercase font-bold">TRẠNG THÁI</p>
                    <p className="text-[9px] font-bold text-white leading-normal mt-1">{assessment.estimated_readiness}</p>
                  </div>
                </div>
              </div>

              {/* Evaluation sub-tabs */}
              <div className="flex border-b border-[#FAF8F5]/10 text-xs shrink-0 font-bold">
                <button
                  onClick={() => setActiveTab('star')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'star' ? 'border-[#C9A84C] text-[#0D0D12]' : 'border-transparent text-[#2A2A35]/60'
                  }`}
                >
                  Phân tích STAR
                </button>
                <button
                  onClick={() => setActiveTab('strengths')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'strengths' ? 'border-[#C9A84C] text-[#0D0D12]' : 'border-transparent text-[#2A2A35]/60'
                  }`}
                >
                  Ưu & Nhược
                </button>
                <button
                  onClick={() => setActiveTab('rewrite')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'rewrite' ? 'border-[#C9A84C] text-[#0D0D12]' : 'border-transparent text-[#2A2A35]/60'
                  }`}
                >
                  Viết lại
                </button>
              </div>

              {/* Main review details content scrolling area */}
              <div className="flex-1 overflow-y-auto space-y-3">
                {activeTab === 'star' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-white border border-neutral-200 text-xs leading-relaxed italic text-[#0D0D12] font-serif shadow-2xs">
                      "{assessment.brutally_honest_summary}"
                    </div>
                    <SpeakFeedback 
                      text={assessment.brutally_honest_summary} 
                      voiceName="M4" 
                      speed={1.05} 
                      lang="en" 
                      accentColor="#C9A84C" 
                    />
                    
                    <div className="grid grid-cols-1 gap-2.5">
                      {Object.entries(assessment.star_method_analysis).map(([stage, text]) => {
                        const stageNames = {
                          situation: 'S - TÌNH HUỐNG',
                          task: 'T - NHIỆM VỤ',
                          action: 'A - HÀNH ĐỘNG',
                          result: 'R - KẾT QUẢ'
                        };
                        return (
                          <div key={stage} className="p-3.5 rounded-2xl border border-neutral-200 bg-white space-y-1 shadow-2xs">
                            <span className="text-[9px] font-mono text-[#C9A84C] bg-[#0D0D12] px-2 py-0.5 rounded uppercase tracking-wide font-bold inline-block">
                              {stageNames[stage.toLowerCase()] || stage.toUpperCase()}
                            </span>
                            <p className="text-[11px] leading-relaxed text-[#2A2A35] mt-1">{text}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'strengths' && (
                  <div className="space-y-4">
                    {/* Strengths */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono text-green-700 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                        <CheckCircle2 size={12} /> Điểm tốt nhất
                      </h4>
                      <ul className="space-y-2">
                        {assessment.best_parts.map((p, idx) => (
                          <li key={idx} className="text-xs leading-relaxed text-[#2A2A35] bg-green-50 border border-green-200 p-3 rounded-xl flex items-start gap-2">
                            <span className="text-green-700 font-extrabold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Areas for Improvement */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono text-red-600 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                        <AlertCircle size={12} /> Cần cải thiện
                      </h4>
                      <ul className="space-y-2">
                        {assessment.areas_for_improvement.map((p, idx) => (
                          <li key={idx} className="text-xs leading-relaxed text-[#2A2A35] bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-2">
                            <span className="text-red-500 font-extrabold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'rewrite' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-[2.2rem] bg-white border border-neutral-200 space-y-2.5 shadow-2xs">
                      <p className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Sparkles size={11} className="text-[#C9A84C]" /> Bản Mẫu Điều Hành
                      </p>
                      <p className="text-xs leading-relaxed text-[#0D0D12] font-serif italic bg-[#FAF8F5] p-3 rounded-lg border border-neutral-200 whitespace-pre-line">
                        "{assessment.better_version}"
                      </p>
                      <SpeakFeedback 
                        text={assessment.better_version} 
                        voiceName="M4" 
                        speed={1.05} 
                        lang="en" 
                        accentColor="#C9A84C" 
                      />
                      <p className="text-[8px] text-[#2A2A35]/70 leading-relaxed">
                        💡 Hãy luyện nói theo câu trả lời hoàn thiện trên để nâng cao tính thuyết phục và chuyên nghiệp trước hội đồng tuyển dụng.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* C. SETTINGS PANEL */}
          {activeView === 'settings' && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              <h3 className="font-extrabold text-sm text-[#0D0D12] pb-2 border-b border-neutral-200 flex items-center gap-1.5 shrink-0">
                <Settings size={16} className="text-[#0D0D12]" /> Cấu hình Coach
              </h3>

              <div className="space-y-4 flex-1">
                {/* Gemini Key */}
                <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <label className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold">Google Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-[#0D0D12] focus:outline-none focus:border-[#C9A84C]"
                  />
                  {!geminiKey && (
                    <p className="text-[9px] font-bold text-[#CC5833] animate-pulse">
                      ⚠️ Cần cấu hình API Key để kích hoạt chức năng chấm điểm AI Gemini.
                    </p>
                  )}
                  <p className="text-[8px] text-[#2A2A35]/70 leading-relaxed">
                    🔑 Key được lưu trực tiếp trên localStorage trình duyệt cá nhân của bạn. Không gửi qua bất kỳ máy chủ trung gian nào. Bảo mật tuyệt đối.
                  </p>
                </div>

                {/* STT Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold">Bộ chuyển đổi giọng nói (STT)</label>
                  <select
                    value={sttProvider}
                    onChange={(e) => setSttProvider(e.target.value)}
                    className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-[#0D0D12] focus:outline-none focus:border-[#C9A84C]"
                  >
                    <option value="cloud">Cloud Whisper API (Đám mây siêu chính xác)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="w-full h-11 rounded-xl bg-[#0D0D12] hover:bg-black text-[#C9A84C] font-bold text-xs transition-all mt-auto shrink-0 shadow-sm cursor-pointer"
              >
                Lưu cấu hình
              </button>
            </div>
          )}

        </div>

        {/* Global Loading Spinner Splash Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[#FAF8F5]/90 backdrop-blur-xs flex flex-col justify-center items-center gap-4 z-50 animate-in fade-in duration-300">
            <RefreshCw className="animate-spin text-[#0D0D12]" size={36} />
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-sm text-[#0D0D12]">AI Coach đang phân tích...</h3>
              <p className="text-[10px] text-[#2A2A35]/70 max-w-[240px] leading-relaxed">Đang đối chiếu cấu trúc câu trả lời STAR và xếp hạng mức độ sẵn sàng tuyển dụng.</p>
            </div>
          </div>
        )}

        {/* Bottom Sheets (Slide-up Topic Selector) */}
        {showTopicDrawer && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs z-40 animate-in fade-in duration-200">
            <div className="absolute bottom-0 left-0 right-0 bg-[#0D0D12] text-[#FAF8F5] rounded-t-[2.2rem] p-6 shadow-2xl border-t border-[#C9A84C]/25 flex flex-col gap-4 max-h-[82%] overflow-y-auto animate-in slide-in-from-bottom duration-300">
              <div className="flex justify-between items-center pb-2 border-b border-white/10 shrink-0">
                <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <BarChart2 size={16} className="text-[#C9A84C]" /> Chọn câu hỏi phỏng vấn
                </h3>
                <button 
                  onClick={() => setShowTopicDrawer(false)}
                  className="text-xs font-bold text-[#C9A84C] cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              <div className="space-y-2.5 overflow-y-auto pr-1">
                {INTERVIEW_QUESTIONS.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      setActiveQuestion(q);
                      setIsUsingCustom(false);
                      setTranscript('');
                      setAssessment(null);
                      setShowTopicDrawer(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-[1.4rem] border text-xs transition-all cursor-pointer ${
                      activeQuestion.id === q.id && !isUsingCustom
                        ? 'border-[#C9A84C] bg-white/5 text-[#FAF8F5]'
                        : 'border-white/5 hover:border-white/15 bg-white/5'
                    }`}
                  >
                    <p className="font-bold text-[#C9A84C] mb-0.5">{q.category}</p>
                    <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed">{q.question}</p>
                  </button>
                ))}

                <button
                  onClick={() => {
                    setIsUsingCustom(true);
                    setTranscript('');
                    setAssessment(null);
                    setShowTopicDrawer(false);
                  }}
                  className={`w-full text-left p-3.5 rounded-[1.4rem] border text-xs transition-all cursor-pointer ${
                    isUsingCustom
                      ? 'border-[#C9A84C] bg-white/5 text-[#FAF8F5]'
                      : 'border-white/5 hover:border-white/15 bg-white/5'
                  }`}
                >
                  <p className="font-bold text-[#C9A84C] mb-0.5">Câu hỏi tự do</p>
                  <p className="text-[10px] text-neutral-400">Tự điền câu hỏi phỏng vấn của riêng bạn từ nhà tuyển dụng.</p>
                </button>
              </div>

              {isUsingCustom && (
                <div className="pt-2 border-t border-white/10 flex flex-col gap-2 shrink-0 animate-in fade-in duration-200">
                  <label className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-wider font-bold">Nội dung câu hỏi phỏng vấn tự do</label>
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Nhập câu hỏi tại đây..."
                    className="w-full text-xs bg-white/5 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-[#C9A84C] resize-none h-16"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Bottom Navigation Pill Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-white/85 backdrop-blur-md border-t border-neutral-200 flex items-center justify-around px-6 z-30 pb-2 shrink-0 select-none">
          <button 
            onClick={() => setActiveView('practice')}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'practice' ? 'text-[#C9A84C] scale-105' : 'text-[#2A2A35]/60 hover:text-[#0D0D12]'
            }`}
          >
            <Mic size={20} className={activeView === 'practice' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">Luyện tập</span>
          </button>
          
          <button 
            onClick={() => {
              if (assessment) {
                setActiveView('report');
              } else {
                setStatusMsg('Hãy trả lời và bấm Chấm Điểm để xem kết quả đánh giá STAR!');
              }
            }}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'report' ? 'text-[#C9A84C] scale-105' : 'text-[#2A2A35]/60 hover:text-[#0D0D12]'
            } ${!assessment ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Award size={20} className={activeView === 'report' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">Đánh giá AI</span>
          </button>

          <button 
            onClick={() => setActiveView('settings')}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'settings' ? 'text-[#C9A84C] scale-105' : 'text-[#2A2A35]/60 hover:text-[#0D0D12]'
            }`}
          >
            <Settings size={20} className={activeView === 'settings' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">Cấu hình</span>
          </button>
        </div>

      </div>
    </div>
  );
}

function SpeakFeedback({ text, voiceName, speed = 1.05, lang = "en", accentColor = "#C9A84C" }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (isOffline) {
        window.speechSynthesis.cancel();
      }
    };
  }, [audioUrl, isOffline]);

  const handleSpeech = async () => {
    if (isPlaying) {
      if (isOffline) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
      } else if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (audioRef.current && !isOffline) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      return;
    }

    setIsLoading(true);
    setIsOffline(false);

    try {
      const backendUrl = import.meta.env.VITE_AI_TO_VOICE_URL || 'http://localhost:8002';
      const response = await fetch(`${backendUrl}/v1/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_name: voiceName, lang, speed }),
      });

      if (!response.ok) {
        throw new Error('Backend synthesis failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      setIsLoading(false);
      setIsPlaying(true);
      audio.play().catch(() => {
        setIsPlaying(false);
      });

    } catch (err) {
      console.warn("Speech synthesis backend failed, falling back to local speech synthesis:", err);
      setIsOffline(true);
      setIsLoading(false);
      setIsPlaying(true);

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'en' ? 'en-US' : 'vi-VN';
      utterance.rate = speed;

      const voices = window.speechSynthesis.getVoices();
      const isFemale = voiceName && voiceName.startsWith('F');
      const matchingVoice = voices.find(v => {
        const nameLower = v.name.toLowerCase();
        if (isFemale) {
          return nameLower.includes('female') || nameLower.includes('google us english') || nameLower.includes('samantha') || nameLower.includes('zira');
        } else {
          return nameLower.includes('male') || nameLower.includes('google uk english male') || nameLower.includes('daniel') || nameLower.includes('david');
        }
      });
      if (matchingVoice) utterance.voice = matchingVoice;

      utterance.onend = () => {
        setIsPlaying(false);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleScrub = (e) => {
    if (audioRef.current && !isOffline) {
      const val = parseFloat(e.target.value);
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatTime = (timeInSec) => {
    if (isNaN(timeInSec)) return "00:00";
    const mins = Math.floor(timeInSec / 60);
    const secs = Math.floor(timeInSec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-[#FAF8F5]/10 backdrop-blur-md rounded-2xl border border-white/10 p-3 flex flex-col gap-2 mt-2 transition-all">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleSpeech}
          disabled={isLoading}
          style={{ '--accent-color': accentColor }}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--accent-color)] text-[#0D0D12] hover:scale-105 active:scale-95 transition-all shadow-md shrink-0 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          )}
        </button>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-wider text-[#FAF8F5]/60 font-bold uppercase">
              {isOffline ? 'Local Speech Synthesis' : 'AI Voice Synthesis'}
            </span>
            {isOffline && (
              <span className="text-[8px] font-mono bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                Offline Mode
              </span>
            )}
          </div>
          <p className="text-[11px] truncate text-[#FAF8F5]/80 mt-0.5">
            {isPlaying ? 'Đang phát âm thanh nhận xét...' : 'Nhấp để nghe nhận xét bằng giọng nói.'}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
          <Volume2 className="w-3.5 h-3.5 text-[#FAF8F5]/60" />
          <span className="text-[9px] font-mono font-bold text-[#FAF8F5]/70">
            {voiceName}
          </span>
        </div>
      </div>

      {(isPlaying || duration > 0) && (
        <div className="flex items-center gap-3 mt-1 px-1 animate-in fade-in duration-200">
          <span className="text-[9px] font-mono text-[#FAF8F5]/50 w-7 shrink-0 text-left">
            {formatTime(currentTime)}
          </span>

          {isOffline ? (
            <div className="flex-1 h-1.5 flex items-center gap-0.5 justify-center">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  style={{
                    backgroundColor: accentColor,
                    animationDelay: `${i * 0.08}s`,
                    height: isPlaying ? '100%' : '20%'
                  }}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlaying ? 'animate-pulse' : ''
                  }`}
                />
              ))}
            </div>
          ) : (
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={handleScrub}
              style={{ accentColor: accentColor }}
              className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer range-xs"
            />
          )}

          <span className="text-[9px] font-mono text-[#FAF8F5]/50 w-7 shrink-0 text-right">
            {isOffline ? '--:--' : formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
