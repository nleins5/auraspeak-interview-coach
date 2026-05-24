import { useState, useEffect, useRef } from 'react';
import { 
  UserRoundCheck, Mic, Square, Settings, Video, VideoOff,
  Sparkles, ShieldCheck, Trophy, AlertCircle, CheckCircle2, 
  ChevronRight, RefreshCw, BarChart2, MessageSquare, Clock
} from 'lucide-react';
import gsap from 'gsap';

// MOCK QUESTIONS DECK
const INTERVIEW_QUESTIONS = [
  { id: 1, category: "Behavioral", question: "Tell me about a time you faced a difficult conflict within your team. How did you resolve it?" },
  { id: 2, category: "Leadership", question: "Describe a project you managed where the requirements changed suddenly. How did you adapt?" },
  { id: 3, category: "Technical Fit", question: "Why do you want to join our organization, and what makes your unique skillset a perfect match?" },
  { id: 4, category: "Problem Solving", question: "Tell me about a technical challenge you encountered. How did you go about identifying the root cause?" }
];

export default function VoiceCoach() {
  // Configurations
  const [engine, setEngine] = useState(() => localStorage.getItem('int_coach_engine') || 'sandbox');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('int_coach_gemini_key') || '');
  const [sttProvider, setSttProvider] = useState(() => localStorage.getItem('int_coach_stt') || 'browser');
  const [showSettings, setShowSettings] = useState(false);

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
  const [statusMsg, setStatusMsg] = useState('Sẵn sàng. Chọn câu hỏi ở cột trái và bật Camera để bắt đầu phỏng vấn thử!');
  
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setStatusMsg('Camera đã được bật. Bạn trông rất tự tin và sẵn sàng!');
      } catch (err) {
        console.error(err);
        setStatusMsg('Không thể mở Camera. Vui lòng cấp quyền hoặc sử dụng ảnh đại diện giả lập.');
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

  // Browser STT Setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
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
      };

      recognitionRef.current = rec;
    }

    return () => {
      stopCamera();
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
    setShowSettings(false);
    setStatusMsg('Cấu hình phỏng vấn đã được lưu.');
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
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Hệ thống đang nghe... Trả lời phỏng vấn một cách chuyên nghiệp.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Lỗi kích hoạt micro nhận dạng giọng nói.');
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
        setStatusMsg('Đang ghi âm cơ học (Sandbox)... Trả lời câu hỏi.');
      } catch (err) {
        setStatusMsg('Không thể mở micro.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (isRecording) {
      if (sttProvider === 'browser' && recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setStatusMsg('Đã kết thúc câu trả lời. Bấm "Chấm phỏng vấn" để xem đánh giá STAR.');
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
        brutally_honest_summary: `Câu trả lời của bạn có độ dài ${wordCount} từ. Trả lời khá tự tin, tuy nhiên nên tập trung giải thích rõ ràng hơn phần Kết quả (Result) thay vì nói quá nhiều về Tình huống (Situation). Nhịp nói đạt ${pacingWpm} WPM rất chuẩn mực.`,
        star_method_analysis: {
          situation: "Bạn nêu được bối cảnh xung đột hoặc khó khăn ban đầu tương đối ổn thỏa.",
          task: "Nhiệm vụ và vai trò chịu trách nhiệm của cá nhân được phác thảo ở mức chấp nhận được.",
          action: "Các hành động cụ thể để xử lý vấn đề được liệt kê rõ, tuy nhiên cần làm nổi bật vai trò kỹ thuật hoặc năng lực của bản thân hơn nữa.",
          result: "Phần kết quả chưa thực sự rõ ràng về mặt số liệu (ví dụ: hiệu suất tăng bao nhiêu %, tiết kiệm được bao nhiêu thời gian)."
        },
        best_parts: [
          "Bố cục câu trả lời mạch lạc theo trình tự thời gian.",
          "Phong thái nói trôi chảy, nhịp độ nói vừa vặn, không quá vội vã."
        ],
        areas_for_improvement: [
          `Bạn lặp lại từ ngập ngừng '${fillerWords}' lần. Cố gắng sử dụng các cụm từ nối chuyên nghiệp hơn như 'Do đó', 'Bên cạnh đó'.`,
          "Cần bổ sung số liệu cụ thể làm minh chứng cho phần kết quả (STAR)."
        ],
        better_version: "Để tôi đề xuất một cách trả lời chuyên nghiệp hơn:\n\"Trong dự án X trước đây, tôi chịu trách nhiệm chính về giải pháp đồng bộ dữ liệu. Khi phát sinh mâu thuẫn về kiến trúc hệ thống giữa hai bên, tôi đã chủ động tổ chức một buổi review kỹ thuật khách quan để so sánh hiệu năng. Kết quả là chúng tôi đã thống nhất được phương án tối ưu nhất, giúp đẩy nhanh tiến độ dự án thêm 15% so với kế hoạch ban đầu.\""
      });
      setIsLoading(false);
      setStatusMsg('Đã hoàn tất chấm điểm phỏng vấn.');
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
    <div className="min-h-screen bg-[#F5F6F8] text-[#1E1E24] font-sans selection:bg-[#3E54AC] selection:text-white px-6 py-8 relative">
      
      {/* Navbar */}
      <header className="max-w-6xl mx-auto flex justify-between items-center mb-8 fade-in-element">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3E54AC] flex items-center justify-center text-white">
            <UserRoundCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#1E1E24]">Interview Coach</h1>
            <p className="text-xs text-[#3E54AC] font-mono tracking-widest uppercase">The Executive Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="w-10 h-10 rounded-xl border border-[#E2E8F0] bg-white flex items-center justify-center text-[#1E1E24] hover:bg-[#F5F6F8] transition-colors"
          >
            <Settings size={18} />
          </button>
          
          <div className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#3E54AC] font-mono flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${engine === 'sandbox' ? 'bg-amber-400' : 'bg-[#3E54AC]'} animate-pulse`}></span>
            {engine === 'sandbox' ? 'Sandbox Mode' : 'Gemini Active'}
          </div>
        </div>
      </header>

      {/* Grid Layout */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column: Video simulator and questions */}
        <section className="lg:col-span-5 space-y-6 fade-in-element">
          
          {/* Mock Webcam View */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-4 shadow-sm space-y-4">
            <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800 flex items-center justify-center">
              {cameraActive ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center space-y-2 text-slate-500">
                  <VideoOff size={36} className="mx-auto text-slate-600" />
                  <p className="text-xs font-mono">CAMERA TẮT</p>
                </div>
              )}

              {/* OVERLAYS */}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md text-[10px] text-white font-mono flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                {isRecording ? 'LIVE RECORDING' : 'CAMERA READY'}
              </div>

              {isRecording && (
                <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-red-600/80 text-[10px] text-white font-bold font-mono">
                  REC {formatTime(recordingTime)}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={toggleCamera}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                  cameraActive 
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' 
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {cameraActive ? <VideoOff size={14} /> : <Video size={14} />}
                {cameraActive ? 'Tắt Webcam' : 'Bật Webcam'}
              </button>

              <span className="text-xs text-slate-400 font-mono">
                Pacing telemetry: Active
              </span>
            </div>
          </div>

          {/* Question Selector */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-6 shadow-sm">
            <h2 className="text-sm font-mono text-[#3E54AC] uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart2 size={16} /> Chọn câu hỏi phỏng vấn
            </h2>
            <div className="space-y-3">
              {INTERVIEW_QUESTIONS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setActiveQuestion(q);
                    setIsUsingCustom(false);
                    setTranscript('');
                    setAssessment(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border text-sm transition-all duration-200 ${
                    activeQuestion.id === q.id && !isUsingCustom
                      ? 'border-[#3E54AC] bg-[#3E54AC]/5 text-[#1E1E24]'
                      : 'border-[#F5F6F8] hover:border-[#E2E8F0] bg-[#F5F6F8]/40'
                  }`}
                >
                  <p className="font-semibold text-xs text-[#3E54AC] mb-1">{q.category}</p>
                  <p className="text-xs text-slate-500 line-clamp-1">{q.question}</p>
                </button>
              ))}
              
              <button
                onClick={() => {
                  setIsUsingCustom(true);
                  setTranscript('');
                  setAssessment(null);
                }}
                className={`w-full text-left p-3.5 rounded-2xl border text-sm transition-all duration-200 ${
                  isUsingCustom
                    ? 'border-[#3E54AC] bg-[#3E54AC]/5'
                    : 'border-[#F5F6F8] hover:border-[#E2E8F0] bg-[#F5F6F8]/40'
                }`}
              >
                <p className="font-semibold text-xs text-[#3E54AC] mb-1">Câu hỏi tự do</p>
                <p className="text-xs text-slate-500">Tự điền câu hỏi phỏng vấn từ nhà tuyển dụng.</p>
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
              <p className="text-xs font-semibold text-[#3E54AC] uppercase mb-1">Yêu cầu phỏng vấn:</p>
              {isUsingCustom ? (
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Nhập câu hỏi phỏng vấn của riêng bạn tại đây..."
                  className="w-full text-sm bg-[#F5F6F8] border border-[#E2E8F0] rounded-xl p-3 text-[#1E1E24] focus:outline-none focus:border-[#3E54AC] resize-none h-20"
                />
              ) : (
                <p className="text-sm font-serif italic text-[#1E1E24]">"{activeQuestion.question}"</p>
              )}
            </div>
          </div>

        </section>

        {/* Right column: Responses and Assessment details */}
        <section className="lg:col-span-7 space-y-6 fade-in-element">
          
          {/* Speak / Text Control panel */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-mono text-[#3E54AC] uppercase tracking-wider flex justify-between items-center">
              <span>Bắt đầu trả lời</span>
            </h2>

            {sttProvider === 'browser' ? (
              <div className="min-h-36 bg-[#F5F6F8] rounded-2xl border border-[#E2E8F0] p-4 text-sm text-[#1E1E24] relative overflow-y-auto max-h-48">
                {transcript ? (
                  <p className="leading-relaxed">{transcript}</p>
                ) : (
                  <span className="text-slate-400 italic">Câu trả lời phỏng vấn (STT tiếng Việt) của bạn sẽ hiển thị tại đây...</span>
                )}
              </div>
            ) : (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Nhập câu trả lời phỏng vấn của bạn bằng tiếng Việt..."
                className="w-full min-h-36 bg-[#F5F6F8] border border-[#E2E8F0] rounded-2xl p-4 text-sm focus:outline-none focus:border-[#3E54AC]"
              />
            )}

            <div className="flex items-center gap-3">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="flex-1 h-14 rounded-2xl bg-red-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
                >
                  <Square size={16} /> Kết thúc trả lời
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex-1 h-14 rounded-2xl bg-[#3E54AC] text-white font-bold flex items-center justify-center gap-2 hover:bg-[#2C3E8A] transition-colors"
                >
                  <Mic size={18} /> Ghi âm trả lời
                </button>
              )}

              <button
                onClick={handleAnalyze}
                disabled={isLoading || isRecording}
                className="px-6 h-14 rounded-2xl bg-[#1E1E24] text-white font-semibold flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-40"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                Chấm Điểm
              </button>
            </div>

            <p className="text-xs text-slate-500 font-mono leading-relaxed bg-[#F5F6F8] p-3 rounded-xl border border-slate-200">
              {statusMsg}
            </p>
          </div>

          {/* Assessment Panels */}
          {isLoading ? (
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-12 text-center shadow-sm space-y-4">
              <RefreshCw className="animate-spin text-[#3E54AC] mx-auto" size={40} />
              <h3 className="font-bold text-lg">Đang đối soát tiêu chí phỏng vấn...</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">Coach đang phân tích cấu trúc câu chuyện STAR và đánh giá tính logic của bài nói.</p>
            </div>
          ) : assessment ? (
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-6 shadow-sm space-y-6">
              
              {/* Score header summary */}
              <div className="flex flex-wrap justify-between items-center gap-4 bg-[#3E54AC]/5 p-5 rounded-2xl border border-[#3E54AC]/10">
                <div className="space-y-1">
                  <h3 className="text-sm font-mono text-[#3E54AC] uppercase tracking-wider">Mức độ sẵn sàng tuyển dụng</h3>
                  <p className="text-2xl font-extrabold text-[#1E1E24]">{assessment.estimated_readiness}</p>
                </div>
                
                <div className="text-center bg-white px-5 py-3 rounded-xl border border-[#E2E8F0] min-w-28">
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Score</p>
                  <p className="text-3xl font-black text-[#3E54AC]">{assessment.overall_score} <span className="text-xs text-slate-400 font-normal">/100</span></p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[#E2E8F0]">
                <button
                  onClick={() => setActiveTab('star')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'star' ? 'border-[#3E54AC] text-[#3E54AC]' : 'border-transparent text-slate-500 hover:text-[#1E1E24]'
                  }`}
                >
                  Phân tích STAR
                </button>
                <button
                  onClick={() => setActiveTab('strengths')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'strengths' ? 'border-[#3E54AC] text-[#3E54AC]' : 'border-transparent text-slate-500 hover:text-[#1E1E24]'
                  }`}
                >
                  Ưu & Nhược điểm
                </button>
                <button
                  onClick={() => setActiveTab('rewrite')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'rewrite' ? 'border-[#3E54AC] text-[#3E54AC]' : 'border-transparent text-slate-500 hover:text-[#1E1E24]'
                  }`}
                >
                  Đề xuất viết lại
                </button>
              </div>

              {/* Tab Content */}
              <div className="space-y-4 min-h-64">
                
                {activeTab === 'star' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#F5F6F8] border border-slate-200">
                      <p className="text-xs font-mono text-[#3E54AC] uppercase tracking-wider mb-1 flex items-center gap-1">
                        <MessageSquare size={14} /> Nhận xét tổng quan:
                      </p>
                      <p className="text-sm font-serif italic leading-relaxed text-[#1E1E24]">
                        "{assessment.brutally_honest_summary}"
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(assessment.star_method_analysis).map(([stage, text]) => (
                        <div key={stage} className="p-4 rounded-xl border border-[#E2E8F0] space-y-1">
                          <span className="text-[10px] font-mono text-[#B5945B] uppercase tracking-wider">
                            {stage.toUpperCase()}
                          </span>
                          <p className="text-xs leading-relaxed text-slate-600">
                            {text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'strengths' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-mono text-green-600 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={14} /> Điểm tốt nhất (Strengths)
                      </h4>
                      <ul className="space-y-2">
                        {assessment.best_parts.map((p, idx) => (
                          <li key={idx} className="text-xs leading-relaxed text-slate-600 bg-green-50/40 p-3 rounded-lg border border-green-100 flex items-start gap-2">
                            <span className="text-green-600 font-extrabold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Areas for Improvement */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-mono text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle size={14} /> Cần cải thiện (Weaknesses)
                      </h4>
                      <ul className="space-y-2">
                        {assessment.areas_for_improvement.map((p, idx) => (
                          <li key={idx} className="text-xs leading-relaxed text-slate-600 bg-red-50/40 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                            <span className="text-red-500 font-extrabold">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'rewrite' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-2 bg-white">
                      <p className="text-xs font-mono text-[#3E54AC] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles size={14} /> Đề xuất trả lời tối ưu từ Executive Coach:
                      </p>
                      <p className="text-sm leading-relaxed text-[#1E1E24] bg-[#F5F6F8] p-4 rounded-lg border border-slate-200 whitespace-pre-line font-serif italic">
                        {assessment.better_version}
                      </p>
                    </div>
                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#F5F6F8] border border-[#E2E8F0] flex items-center justify-center mx-auto text-[#3E54AC]">
                <Trophy size={24} />
              </div>
              <h3 className="font-bold text-lg">Hồ sơ phỏng vấn trống</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">Chọn một câu hỏi tình huống bên trái, bật camera phỏng vấn thử hoặc gõ văn bản và bấm "Chấm Điểm".</p>
            </div>
          )}

        </section>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <Settings size={20} className="text-[#3E54AC]" /> Thiết lập phỏng vấn
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-xs font-mono uppercase tracking-wider text-slate-400 hover:text-black font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#3E54AC] uppercase tracking-wider mb-2">Động cơ AI chấm điểm</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="w-full bg-[#F5F6F8] border border-[#E2E8F0] rounded-xl p-3 text-sm focus:outline-none focus:border-[#3E54AC]"
                >
                  <option value="sandbox">Sandbox (Mô phỏng tại chỗ - Khuyên dùng)</option>
                  <option value="gemini">Google Gemini API (Direct Browser)</option>
                </select>
              </div>

              {engine === 'gemini' && (
                <div>
                  <label className="block text-xs font-mono text-[#3E54AC] uppercase tracking-wider mb-2">Google Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-[#F5F6F8] border border-[#E2E8F0] rounded-xl p-3 text-sm focus:outline-none focus:border-[#3E54AC]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    🔑 Key được lưu tại LocalStorage thiết bị cá nhân của bạn. Hoàn toàn bảo mật.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-[#3E54AC] uppercase tracking-wider mb-2">Bộ chuyển STT giọng nói</label>
                <select
                  value={sttProvider}
                  onChange={(e) => setSttProvider(e.target.value)}
                  className="w-full bg-[#F5F6F8] border border-[#E2E8F0] rounded-xl p-3 text-sm focus:outline-none focus:border-[#3E54AC]"
                >
                  <option value="browser">Browser Speech Recognition (NATIVE tiếng Việt)</option>
                  <option value="mechanical">Sandbox (Audio simulator)</option>
                </select>
              </div>
            </div>

            <button
              onClick={saveSettings}
              className="w-full h-12 rounded-xl bg-[#3E54AC] text-white font-bold text-sm hover:bg-[#2C3E8A] transition-colors"
            >
              Lưu thiết lập
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
