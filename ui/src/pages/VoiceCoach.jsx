import { useState, useEffect, useRef } from 'react';
import { 
  UserRoundCheck, Mic, Square, Settings, Video, VideoOff,
  Sparkles, ShieldCheck, Trophy, AlertCircle, CheckCircle2, 
  ChevronRight, RefreshCw, BarChart2, MessageSquare, Clock, Award
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
  // Configurations
  const [engine, setEngine] = useState(() => localStorage.getItem('int_coach_engine') || 'sandbox');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('int_coach_gemini_key') || '');
  const [sttProvider, setSttProvider] = useState(() => localStorage.getItem('int_coach_stt') || 'browser');
  
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
  const [assessment, setAssessment] = useState(null);
  const [activeTab, setActiveTab] = useState('star'); // star, strengths, rewrite
  const [textInput, setTextInput] = useState('');

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

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
      setSttProvider('manual');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'vi-VN'; // Vietnamese primary for Interview Coach

    rec.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
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
      } catch (err) {}
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
    localStorage.setItem('int_coach_engine', engine);
    localStorage.setItem('int_coach_gemini_key', geminiKey);
    localStorage.setItem('int_coach_stt', sttProvider);
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

  // Start Interview Recording
  const startRecording = async () => {
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMsg('Trình duyệt không hỗ trợ ghi âm.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = () => {
          setStatusMsg('Đã ghi âm xong. Chờ phân tích...');
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Đang ghi âm (Mô phỏng Sandbox)... Hãy trả lời phỏng vấn, sau đó nhập văn bản.');
      } catch (err) {
        console.error('MediaRecorder start error:', err);
        setStatusMsg('Lỗi bắt đầu ghi âm cơ học. Hãy cấp quyền truy cập Micro.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (isRecording) {
      if (sttProvider === 'browser' && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {}
      }
      setIsRecording(false);
      setStatusMsg('Đã kết thúc câu trả lời. Bấm "Chấm Điểm" để xem đánh giá STAR.');
    }
  };

  // Local Sandbox Grading for Interview
  const generateSandboxReport = (text) => {
    setIsLoading(true);
    setStatusMsg('Đang phân tích cấu trúc STAR & Pacing câu trả lời...');
    
    setTimeout(() => {
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const fillerWords = (text.match(/\b(thì|là|mà|như là|kiểu như|kiểu|với lại|à|ừm)\b/ig) || []).length;
      const pacingWpm = recordingTime > 0 ? Math.round((wordCount / recordingTime) * 60) : 125;

      let score = 75;
      if (wordCount > 30) score += 5;
      if (wordCount > 60) score += 5;
      if (fillerWords < 3) score += 5;
      if (pacingWpm >= 110 && pacingWpm <= 145) score += 5;
      score = Math.min(95, Math.max(50, score));

      let readiness = "Cần Cải Thiện";
      if (score >= 85) readiness = "Sẵn Sàng Xuất Sắc";
      else if (score >= 75) readiness = "Sẵn Sàng";

      setAssessment({
        overall_score: score,
        estimated_readiness: readiness,
        brutally_honest_summary: `Câu trả lời phỏng vấn thử của bạn có độ dài ${wordCount} từ. Trả lời khá tự tin, tuy nhiên nên tập trung giải thích rõ ràng hơn phần Kết quả (Result) thay vì mô tả quá sâu vào Tình huống (Situation). Nhịp nói đạt ${pacingWpm} WPM rất chuẩn mực.`,
        star_method_analysis: {
          situation: "Bạn nêu được bối cảnh xung đột hoặc khó khăn ban đầu tương đối ổn thỏa.",
          task: "Nhiệm vụ và vai trò chịu trách nhiệm của cá nhân được phác thảo ở mức chấp nhận được.",
          action: "Các hành động cụ thể để xử lý vấn đề được liệt kê rõ, tuy nhiên cần làm nổi bật vai trò lãnh đạo hoặc chuyên môn cá nhân của bạn.",
          result: "Phần kết quả chưa thực sự rõ ràng về mặt số liệu (ví dụ: hiệu suất tăng bao nhiêu %, tiết kiệm được bao nhiêu thời gian)."
        },
        best_parts: [
          "Bố cục câu trả lời mạch lạc theo trình tự thời gian.",
          "Phong thái nói trôi chảy, nhịp độ nói vừa vặn, không quá vội vã."
        ],
        areas_for_improvement: [
          `Bạn lặp lại từ ngập ngừng '${fillerWords}' lần. Cố gắng sử dụng các cụm từ nối chuyên nghiệp hơn như 'Do đó', 'Bên cạnh đó'.`,
          "Cần bổ sung số liệu cụ thể làm minh chứng cho phần kết quả (Result) trong cấu trúc STAR."
        ],
        better_version: "Để tôi đề xuất một cách trả lời mẫu hoàn hảo:\n\"Trong dự án X trước đây, tôi chịu trách nhiệm chính về giải pháp đồng bộ dữ liệu. Khi phát sinh mâu thuẫn về kiến trúc hệ thống giữa hai bên, tôi đã chủ động tổ chức một buổi review kỹ thuật khách quan để so sánh hiệu năng. Kết quả là chúng tôi đã thống nhất được phương án tối ưu nhất, giúp đẩy nhanh tiến độ dự án thêm 15% so với kế hoạch ban đầu.\""
      });
      setIsLoading(false);
      setStatusMsg('Đã hoàn tất chấm điểm phỏng vấn.');
      setActiveView('report');
    }, 1500);
  };

  // Call Gemini directly for Interview
  const analyzeWithGemini = async (textToAnalyze) => {
    if (!geminiKey) {
      setStatusMsg('Thiếu Gemini API Key trong phần Cài Đặt.');
      return;
    }
    
    setIsLoading(true);
    setStatusMsg('Kết nối trực tiếp tới Google Gemini để phân tích STAR...');

    const systemInstruction = `
      You are a world-class IT and Corporate Recruiter and Executive Interview Coach.
      Analyze the user's verbal response to the interview question.
      The query language is Vietnamese. Evaluate in highly professional Vietnamese.
      
      Structure your analysis based on the STAR method (Situation, Task, Action, Result).
      Provide your strict assessment in raw JSON format strictly matching this structure:
      {
        "overall_score": 85,
        "estimated_readiness": "Sẵn Sàng",
        "brutally_honest_summary": "Tóm tắt phản hồi ngắn gọn về phỏng vấn bằng tiếng Việt...",
        "star_method_analysis": {
          "situation": "Đánh giá tình huống (S) bằng tiếng Việt...",
          "task": "Đánh giá nhiệm vụ (T) bằng tiếng Việt...",
          "action": "Đánh giá hành động (A) bằng tiếng Việt...",
          "result": "Đánh giá kết quả (R) bằng tiếng Việt..."
        },
        "best_parts": [
          "Điểm tốt 1...",
          "Điểm tốt 2..."
        ],
        "areas_for_improvement": [
          "Điểm cần cải thiện 1...",
          "Điểm cần cải thiện 2..."
        ],
        "better_version": "Phiên bản viết lại câu trả lời mẫu hoàn hảo và chuyên nghiệp nhất bằng tiếng Việt..."
      }
    `;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemInstruction}\n\nInterview question: "${activeQuestion.question}"\nUser response: "${textToAnalyze}"` }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(rawText.trim());
      setAssessment(parsed);
      setStatusMsg('Đã nhận phản hồi phân tích từ Gemini.');
      setActiveView('report');
    } catch (err) {
      console.error(err);
      setStatusMsg(`Lỗi kết nối API: ${err.message}. Tự động kích hoạt Sandbox.`);
      generateSandboxReport(textToAnalyze);
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
    
    if (engine === 'gemini' && geminiKey) {
      analyzeWithGemini(textToAnalyze);
    } else {
      generateSandboxReport(textToAnalyze);
    }
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
            {engine === 'sandbox' ? 'MÔ PHỎNG' : 'GEMINI TRỰC TIẾP'}
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

                {sttProvider !== 'browser' && (
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
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all transform cursor-pointer z-10 ${
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
              </div>

              {/* Action submission buttons */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleAnalyze}
                  disabled={isLoading || isRecording}
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

          {/* B. REPORT PANEL */}
          {activeView === 'report' && assessment && (
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
                    
                    <div className="grid grid-cols-1 gap-2.5">
                      {Object.entries(assessment.star_method_analysis).map(([stage, text]) => (
                        <div key={stage} className="p-3.5 rounded-2xl border border-neutral-200 bg-white space-y-1 shadow-2xs">
                          <span className="text-[9px] font-mono text-[#C9A84C] bg-[#0D0D12] px-2 py-0.5 rounded uppercase tracking-wide font-bold inline-block">
                            {stage.toUpperCase()}
                          </span>
                          <p className="text-[11px] leading-relaxed text-[#2A2A35] mt-1">{text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'strengths' && (
                  <div className="space-y-4">
                    {/* Strengths */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono text-green-700 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                        <CheckCircle2 size={12} /> Điểm tốt nhất (Strengths)
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
                        <AlertCircle size={12} /> Cần cải thiện (Weaknesses)
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
                {/* Grading Engine Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold">Phương thức chấm điểm (LLM)</label>
                  <select
                     value={engine}
                     onChange={(e) => setEngine(e.target.value)}
                     className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-[#0D0D12] focus:outline-none focus:border-[#C9A84C]"
                  >
                    <option value="sandbox">Sandbox (Ngoại tuyến - Miễn phí 100%)</option>
                    <option value="gemini">Google Gemini API (Trực tiếp từ trình duyệt)</option>
                  </select>
                </div>

                {/* Gemini Key */}
                {engine === 'gemini' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    <label className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold">Google Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-[#0D0D12] focus:outline-none focus:border-[#C9A84C]"
                    />
                    <p className="text-[8px] text-[#2A2A35]/70 leading-relaxed">
                      🔑 Key được lưu trực tiếp trên localStorage trình duyệt cá nhân của bạn. Không gửi qua bất kỳ máy chủ trung gian nào. Bảo mật tuyệt đối.
                    </p>
                  </div>
                )}

                {/* STT Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#0D0D12] uppercase tracking-wider font-bold">Bộ chuyển đổi giọng nói (STT)</label>
                  <select
                    value={sttProvider}
                    onChange={(e) => setSttProvider(e.target.value)}
                    className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-[#0D0D12] focus:outline-none focus:border-[#C9A84C]"
                  >
                    <option value="browser">Browser Web Speech API (NATIVE - Khuyên dùng)</option>
                    <option value="mechanical">Giọng nói mô phỏng (Trình giả lập Sandbox)</option>
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
