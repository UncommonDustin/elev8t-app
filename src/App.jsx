import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://gvmzblllsepimhjrrwqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bXpibGxsc2VwaW1oanJyd3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA3NzMsImV4cCI6MjA4OTAwNjc3M30.FSK1cPD4VWH3FgGXxOGWFtxITQG1J-hsN1Xdab4_X-g";
const USER_ID = "dustin-lamphere";
const USER_NAME = "Dustin";
const USER_GOALS = [
  "Stay consistent in the gym",
  "Be more present with family",
  "Grow and scale YouTube channel to 1,000 subscribers and monetization",
  "Grow ELEV8T brand and content",
  "Launch digital products"
];

const POINTS_PER_TASK = 50;
const BONUS_ALL = 250;

const CAT_COLORS = {
  "Fitness": "#f97316",
  "Mindset": "#a78bfa",
  "Business": "#34d399",
  "Family": "#f472b6",
  "Discipline": "#facc15",
};

const JOURNAL_PROMPTS = [
  "What's one thing you need to own today that you've been avoiding?",
  "Where did you fall short yesterday — and what does that cost you?",
  "What would the best version of you do differently today?",
  "Who needs you to show up better and how will you do that today?",
  "What's the ONE thing that if done today, makes everything else easier?",
  "What fear is disguising itself as a reason not to execute?",
  "What does winning look like for you today — specifically?",
];

const TABS = [
  { id: "power", label: "POWER LIST", icon: "⚡" },
  { id: "coach", label: "AI COACH", icon: "🧠" },
  { id: "journal", label: "JOURNAL", icon: "📓" },
  { id: "photos", label: "PHOTOS", icon: "📸" },
  { id: "challenges", label: "CHALLENGES", icon: "🎯" },
  { id: "week", label: "WEEKLY", icon: "📊" },
];

function todayKey() { return new Date().toISOString().split("T")[0]; }
function weekKey() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
}

function defaultTasks() {
  return [
    { id: 1, text: "Complete a 30-min workout", category: "Fitness", completed: false },
    { id: 2, text: "Work on ELEV8T content for 1 hour", category: "Business", completed: false },
    { id: 3, text: "Be fully present with family — no phone at dinner", category: "Family", completed: false },
    { id: 4, text: "10 min visualization or meditation", category: "Mindset", completed: false },
    { id: 5, text: "Complete your full morning routine", category: "Discipline", completed: false },
  ];
}

async function dbLoad() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/elev8t_data?user_id=eq.${USER_ID}&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      }
    });
    const data = await res.json();
    return data?.[0] || null;
  } catch { return null; }
}

async function dbSave(payload) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/elev8t_data`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_id: USER_ID, ...payload, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

const COACH_SYSTEM = `You are ELEV8T Coach — a personal accountability coach for ${USER_NAME}. 
His goals: ${USER_GOALS.join(", ")}.
Your tone: direct and no-BS when needed, motivational when he needs fire, calm and strategic when planning. Mix all three based on context.
You know his brand is called ELEV8T / "Excellence is Defiance". He runs a bar (Section Line Bar & Grill) with his partner Sarah. He's a father and family man building a YouTube channel, digital products, and a personal brand for blue-collar dads and operators.
Keep responses focused, punchy, and actionable. No fluff. No generic motivation. Speak directly to Dustin's real situation.`;

export default function ELEV8TApp() {
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [tab, setTab] = useState("power");
  const [tasks, setTasks] = useState(defaultTasks());
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [todayWon, setTodayWon] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [journalEntries, setJournalEntries] = useState({});
  const [journalPrompt] = useState(() => JOURNAL_PROMPTS[new Date().getDay() % JOURNAL_PROMPTS.length]);
  const [photos, setPhotos] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [weekHistory, setWeekHistory] = useState({});
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskCat, setNewTaskCat] = useState("Fitness");
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachInput, setCoachInput] = useState("");
  const [coachTyping, setCoachTyping] = useState(false);
  const [addingChallenge, setAddingChallenge] = useState(false);
  const [newChallengeName, setNewChallengeName] = useState("");
  const [newChallengeDesc, setNewChallengeDesc] = useState("");
  const [newChallengeDays, setNewChallengeDays] = useState(30);
  const fileRef = useRef();
  const chatEndRef = useRef();
  const syncTimer = useRef(null);

  const journalText = journalEntries[todayKey()] || "";
  const completedCount = tasks.filter(t => t.completed).length;
  const allDone = completedCount === tasks.length && tasks.length > 0;
  const todayXP = completedCount * POINTS_PER_TASK + (allDone ? BONUS_ALL : 0);

  useEffect(() => {
    async function init() {
      const remote = await dbLoad();
      if (remote) {
        if (remote.tasks) setTasks(remote.tasks);
        if (remote.journal) setJournalEntries(remote.journal);
        if (remote.photos) setPhotos(remote.photos);
        if (remote.challenges) setChallenges(remote.challenges);
        if (remote.week_history) setWeekHistory(remote.week_history);
        if (remote.points !== undefined) setPoints(remote.points);
        if (remote.streak !== undefined) setStreak(remote.streak);
        if (remote.total_wins !== undefined) setTotalWins(remote.total_wins);
        const wonToday = remote.tasks?.every(t => t.completed) && remote.tasks?.length > 0;
        setTodayWon(wonToday || false);
      }
      setLoaded(true);
    }
    init();
  }, []);

  function triggerSync(overrides = {}) {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      await dbSave({
        tasks, journal: journalEntries, photos, challenges,
        week_history: weekHistory, points, streak, total_wins: totalWins,
        ...overrides,
      });
      setSyncing(false);
      setLastSync(new Date().toLocaleTimeString());
    }, 1500);
  }

  useEffect(() => { if (loaded) triggerSync({ tasks }); }, [tasks]);
  useEffect(() => { if (loaded) triggerSync({ journal: journalEntries }); }, [journalEntries]);
  useEffect(() => { if (loaded) triggerSync({ photos }); }, [photos]);
  useEffect(() => { if (loaded) triggerSync({ challenges }); }, [challenges]);

  useEffect(() => {
    if (!loaded) return;
    const updated = { ...weekHistory, [todayKey()]: { completed: completedCount, total: tasks.length, xp: todayXP, won: allDone } };
    setWeekHistory(updated);
    triggerSync({ week_history: updated });
  }, [completedCount, tasks.length, allDone]);

  useEffect(() => {
    if (!loaded) return;
    if (allDone && !todayWon) {
      const np = points + todayXP;
      const ns = streak + 1;
      const nw = totalWins + 1;
      setPoints(np); setStreak(ns); setTotalWins(nw); setTodayWon(true);
      setShowWin(true);
      setTimeout(() => setShowWin(false), 3500);
      triggerSync({ points: np, streak: ns, total_wins: nw });
    }
  }, [allDone]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [coachMessages, coachTyping]);

  function toggleTask(id) { setTasks(p => p.map(t => t.id === id ? { ...t, completed: !t.completed } : t)); }
  function addTask() {
    if (!newTaskText.trim()) return;
    setTasks(p => [...p, { id: Date.now(), text: newTaskText.trim(), category: newTaskCat, completed: false }]);
    setNewTaskText(""); setAddingTask(false);
  }
  function removeTask(id) { setTasks(p => p.filter(t => t.id !== id)); }
  function saveEdit(id) { setTasks(p => p.map(t => t.id === id ? { ...t, text: editVal } : t)); setEditingId(null); }

  async function getSuggestions() {
    setAiLoading(true);
    try {
      const prompt = `Generate exactly 5 daily Power List tasks for Dustin for today. Goals: ${USER_GOALS.join("; ")}. Make them specific, actionable, and achievable in one day. Return ONLY a JSON array, no markdown, no explanation. Example: [{"text":"Task","category":"Fitness"}]. Categories must be one of: Fitness, Mindset, Business, Family, Discipline.`;
      const raw = await callClaude([{ role: "user", content: prompt }], COACH_SYSTEM, 600);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) setTasks(parsed.slice(0, 5).map((t, i) => ({ id: Date.now() + i, text: t.text, category: t.category || "Discipline", completed: false })));
    } catch (e) { console.error(e); }
    setAiLoading(false);
  }

  async function sendCoachMessage() {
    const msg = coachInput.trim();
    if (!msg || coachTyping) return;
    const userMsg = { role: "user", content: msg };
    const newMsgs = [...coachMessages, userMsg];
    setCoachMessages(newMsgs);
    setCoachInput("");
    setCoachTyping(true);
    try {
      const context = `Today's tasks: ${tasks.map(t => `${t.text} (${t.completed ? "✓" : "✗"})`).join(", ")}. Streak: ${streak} days. Total XP: ${points}.`;
      const reply = await callClaude(newMsgs.slice(-10), COACH_SYSTEM + "\n\n" + context, 800);
      setCoachMessages(p => [...p, { role: "assistant", content: reply }]);
    } catch { setCoachMessages(p => [...p, { role: "assistant", content: "Something went wrong. Try again." }]); }
    setCoachTyping(false);
  }

  async function initCoach() {
    if (coachMessages.length > 0) return;
    setCoachTyping(true);
    try {
      const reply = await callClaude([{ role: "user", content: "Greet Dustin in 1-2 sentences. Be direct. Ask what he needs today." }], COACH_SYSTEM, 200);
      setCoachMessages([{ role: "assistant", content: reply }]);
    } catch { setCoachMessages([{ role: "assistant", content: "What's up Dustin. What do you need to work through today?" }]); }
    setCoachTyping(false);
  }

  function handleTabChange(t) { setTab(t); if (t === "coach") initCoach(); }

  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotos(p => [{ id: Date.now(), date: todayKey(), label: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), src: ev.target.result, note: "" }, ...p]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }
  function updatePhotoNote(id, note) { setPhotos(p => p.map(ph => ph.id === id ? { ...ph, note } : ph)); }
  function deletePhoto(id) { setPhotos(p => p.filter(ph => ph.id !== id)); }

  function createChallenge() {
    if (!newChallengeName.trim()) return;
    setChallenges(p => [...p, { id: Date.now(), name: newChallengeName.trim(), desc: newChallengeDesc.trim(), duration: parseInt(newChallengeDays) || 30, currentDay: 1, active: true, startDate: todayKey(), lastChecked: null }]);
    setNewChallengeName(""); setNewChallengeDesc(""); setNewChallengeDays(30); setAddingChallenge(false);
  }
  function markChallengeDay(id) {
    setChallenges(p => p.map(c => {
      if (c.id !== id || c.lastChecked === todayKey()) return c;
      const next = c.currentDay + 1;
      if (next > c.duration) return { ...c, active: false, completed: true, currentDay: c.duration, lastChecked: todayKey() };
      return { ...c, currentDay: next, lastChecked: todayKey() };
    }));
  }
  function deleteChallenge(id) { setChallenges(p => p.filter(c => c.id !== id)); }

  function getWeekDays() {
    const days = [], now = new Date(), dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const key = d.toISOString().split("T")[0];
      days.push({ key, label: d.toLocaleDateString("en-US", { weekday: "short" }), date: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }), data: weekHistory[key] || null, isToday: key === todayKey(), isFuture: d > now && key !== todayKey() });
    }
    return days;
  }

  const weekDays = getWeekDays();
  const winsThisWeek = weekDays.filter(d => d.data?.won).length;
  const xpThisWeek = weekDays.reduce((sum, d) => sum + (d.data?.xp || 0), 0);
  const s = styles;

  if (!loaded) return (
    <div style={{ ...s.root, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 5, color: "#f97316" }}>ELEV8T</div>
      <div style={{ fontSize: 13, letterSpacing: 3, color: "#555" }}>LOADING YOUR DATA...</div>
    </div>
  );

  return (
    <div style={s.root}>
      <style>{globalCSS}</style>
      {showWin && (
        <div style={s.winOverlay}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64 }}>🔥</div>
            <div style={s.winTitle}>DAY WON</div>
            <div style={s.winSub}>+{todayXP} XP · EXCELLENCE IS DEFIANCE</div>
          </div>
        </div>
      )}
      <div style={s.container}>
        <div style={s.header}>
          <div>
            <div style={s.headerEyebrow}>ELEV8T · EXCELLENCE IS DEFIANCE</div>
            <div style={s.headerTitle}>OPERATOR<br />SYSTEM</div>
          </div>
          <div style={s.headerRight}>
            <div style={s.headerDate}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
            <div style={s.headerGreeting}>GM, {USER_NAME} 👊</div>
            <div style={s.syncStatus}>{syncing ? "⟳ SYNCING..." : lastSync ? `✓ SYNCED ${lastSync}` : "✓ LIVE"}</div>
          </div>
        </div>
        <div style={s.xpStrip}>
          <div style={s.xpLeft}>
            <div style={s.xpLabel}>TODAY</div>
            <div style={s.xpBarWrap}>
              <div style={{ ...s.xpBarFill, width: `${Math.min(100, (completedCount / Math.max(tasks.length, 1)) * 100)}%`, background: allDone ? "#facc15" : "#f97316" }} />
            </div>
            <div style={s.xpCount}>{completedCount}/{tasks.length} tasks · {todayXP} XP</div>
          </div>
          <div style={s.xpStats}>
            {[{ v: streak, l: "STREAK", c: "#f97316" }, { v: totalWins, l: "WINS", c: "#34d399" }, { v: points, l: "TOTAL XP", c: "#facc15" }].map(m => (
              <div key={m.l} style={s.xpStat}>
                <div style={{ ...s.xpStatNum, color: m.c }}>{m.v}</div>
                <div style={s.xpStatLabel}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={s.tabBar}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)} style={{ ...s.tabBtn, ...(tab === t.id ? s.tabBtnActive : {}) }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "power" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>TODAY'S POWER LIST</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={getSuggestions} disabled={aiLoading} style={s.btnGhost}>{aiLoading ? "..." : "✦ AI SUGGEST"}</button>
                <button onClick={() => setAddingTask(a => !a)} style={s.btnAccent}>+ ADD</button>
              </div>
            </div>
            {addingTask && (
              <div style={s.addBox}>
                <input value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} placeholder="What's your task..." style={s.input} autoFocus />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <select value={newTaskCat} onChange={e => setNewTaskCat(e.target.value)} style={s.select}>{Object.keys(CAT_COLORS).map(c => <option key={c}>{c}</option>)}</select>
                  <button onClick={addTask} style={s.btnAccent}>ADD TASK</button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.map(task => (
                <div key={task.id} style={{ ...s.taskCard, ...(task.completed ? s.taskCardDone : {}), borderLeft: `3px solid ${CAT_COLORS[task.category] || "#f97316"}` }}>
                  <button onClick={() => toggleTask(task.id)} style={{ ...s.checkBtn, ...(task.completed ? s.checkBtnDone : {}) }}>
                    {task.completed && <span style={{ color: "#000", fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1 }}>
                    {editingId === task.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(task.id)} autoFocus style={{ ...s.input, flex: 1, padding: "4px 8px", fontSize: 13 }} />
                        <button onClick={() => saveEdit(task.id)} style={s.btnAccentSm}>SAVE</button>
                      </div>
                    ) : (
                      <div style={{ ...s.taskText, ...(task.completed ? s.taskTextDone : {}) }}>{task.text}</div>
                    )}
                    <div style={s.taskMeta}>
                      <span style={{ ...s.catBadge, color: CAT_COLORS[task.category] || "#888" }}>{task.category?.toUpperCase()}</span>
                      <span style={s.xpBadge}>+{POINTS_PER_TASK} XP</span>
                    </div>
                  </div>
                  {!task.completed && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setEditingId(task.id); setEditVal(task.text); }} style={s.iconBtn}>✎</button>
                      <button onClick={() => removeTask(task.id)} style={s.iconBtn}>×</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {allDone && <div style={s.winBanner}><div style={s.winBannerTitle}>🔥 DAY COMPLETE</div><div style={s.winBannerSub}>KEEP THE STREAK ALIVE · EXCELLENCE IS DEFIANCE</div></div>}
            <div style={s.scoringNote}>Scoring: {POINTS_PER_TASK} XP per task · +{BONUS_ALL} XP bonus when all tasks complete</div>
          </div>
        )}

        {tab === "coach" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>AI COACH</div>
              <button onClick={() => setCoachMessages([])} style={s.btnGhost}>CLEAR</button>
            </div>
            <div style={s.chatWrap}>
              {coachMessages.length === 0 && !coachTyping && (
                <div style={s.chatEmpty}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
                  <div style={{ fontSize: 13, color: "#555", letterSpacing: 2 }}>COACH IS READY</div>
                  <button onClick={initCoach} style={{ ...s.btnAccent, marginTop: 12 }}>START SESSION</button>
                </div>
              )}
              {coachMessages.map((m, i) => (
                <div key={i} style={{ ...s.chatMsg, ...(m.role === "user" ? s.chatMsgUser : s.chatMsgAssistant) }}>
                  {m.role === "assistant" && <div style={s.chatLabel}>ELEV8T COACH</div>}
                  <div style={s.chatText}>{m.content}</div>
                </div>
              ))}
              {coachTyping && (
                <div style={{ ...s.chatMsg, ...s.chatMsgAssistant }}>
                  <div style={s.chatLabel}>ELEV8T COACH</div>
                  <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
                    {[0, 1, 2].map(i => <span key={i} style={{ display: "inline-block", width: 6, height: 6, background: "#f97316", borderRadius: "50%", animation: `bounce 1.2s infinite ${i * 0.2}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={s.chatInputWrap}>
              <input value={coachInput} onChange={e => setCoachInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendCoachMessage()} placeholder="Ask your coach anything..." style={{ ...s.input, flex: 1 }} disabled={coachTyping} />
              <button onClick={sendCoachMessage} disabled={coachTyping || !coachInput.trim()} style={s.btnAccent}>{coachTyping ? "..." : "SEND"}</button>
            </div>
          </div>
        )}

        {tab === "journal" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>DAILY JOURNAL</div>
              <div style={s.syncStatus}>{syncing ? "SAVING..." : "AUTO-SAVED"}</div>
            </div>
            <div style={s.promptCard}>
              <div style={s.promptLabel}>TODAY'S PROMPT</div>
              <div style={s.promptText}>"{journalPrompt}"</div>
            </div>
            <textarea value={journalText} onChange={e => setJournalEntries(p => ({ ...p, [todayKey()]: e.target.value }))} placeholder="Write honestly. No one's watching. Own it..." style={s.textarea} />
            <div style={s.journalMeta}>{journalText.length} characters · {journalText.split(/\s+/).filter(Boolean).length} words</div>
          </div>
        )}

        {tab === "photos" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>PROGRESS PHOTOS</div>
              <button onClick={() => fileRef.current.click()} style={s.btnAccent}>+ UPLOAD</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
            {photos.length === 0 ? (
              <div style={s.emptyState}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
                <div style={s.emptyTitle}>NO PHOTOS YET</div>
                <div style={s.emptyDesc}>Upload your first progress photo to start tracking.</div>
                <button onClick={() => fileRef.current.click()} style={{ ...s.btnAccent, marginTop: 16 }}>UPLOAD FIRST PHOTO</button>
              </div>
            ) : (
              <div style={s.photoGrid}>
                {photos.map(photo => (
                  <div key={photo.id} style={s.photoCard}>
                    <img src={photo.src} alt={photo.label} style={s.photoImg} />
                    <div style={s.photoInfo}>
                      <div style={s.photoDate}>{photo.label}</div>
                      <input value={photo.note} onChange={e => updatePhotoNote(photo.id, e.target.value)} placeholder="Add note..." style={{ ...s.input, fontSize: 12, padding: "4px 8px", marginTop: 6 }} />
                      <button onClick={() => deletePhoto(photo.id)} style={{ ...s.btnGhost, marginTop: 6, fontSize: 10, padding: "3px 8px" }}>DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "challenges" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>CHALLENGES</div>
              <button onClick={() => setAddingChallenge(a => !a)} style={s.btnAccent}>+ CREATE</button>
            </div>
            {addingChallenge && (
              <div style={s.addBox}>
                <input value={newChallengeName} onChange={e => setNewChallengeName(e.target.value)} placeholder="Challenge name..." style={s.input} />
                <input value={newChallengeDesc} onChange={e => setNewChallengeDesc(e.target.value)} placeholder="What's the commitment? (optional)" style={{ ...s.input, marginTop: 8 }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <select value={newChallengeDays} onChange={e => setNewChallengeDays(e.target.value)} style={s.select}>
                    {[7, 14, 21, 30, 60, 75, 90].map(d => <option key={d} value={d}>{d} Days</option>)}
                  </select>
                  <button onClick={createChallenge} style={s.btnAccent}>CREATE</button>
                </div>
              </div>
            )}
            {challenges.length === 0 && !addingChallenge && (
              <div style={s.emptyState}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                <div style={s.emptyTitle}>NO ACTIVE CHALLENGES</div>
                <div style={s.emptyDesc}>Create your first challenge to start building momentum.</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {challenges.map(c => (
                <div key={c.id} style={{ ...s.challengeCard, ...(c.completed ? s.challengeCardDone : {}) }}>
                  <div style={s.challengeTop}>
                    <div>
                      <div style={s.challengeName}>{c.name}</div>
                      {c.desc && <div style={s.challengeDesc}>{c.desc}</div>}
                    </div>
                    <div style={s.challengeDayBig}>
                      {c.completed ? "✓" : c.currentDay}
                      <div style={s.challengeDayLabel}>{c.completed ? "DONE" : `/ ${c.duration}`}</div>
                    </div>
                  </div>
                  <div style={s.progressWrap}>
                    <div style={{ ...s.progressFill, width: `${Math.min(100, ((c.currentDay - 1) / c.duration) * 100)}%`, background: c.completed ? "#34d399" : "#f97316" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {c.active && !c.completed && (
                      <button onClick={() => markChallengeDay(c.id)} disabled={c.lastChecked === todayKey()} style={{ ...s.btnAccent, flex: 1, opacity: c.lastChecked === todayKey() ? 0.4 : 1 }}>
                        {c.lastChecked === todayKey() ? "✓ DAY LOGGED" : "MARK DAY COMPLETE"}
                      </button>
                    )}
                    {c.completed && <div style={s.completedTag}>CHALLENGE COMPLETE 🏆</div>}
                    <button onClick={() => deleteChallenge(c.id)} style={s.btnGhost}>REMOVE</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "week" && (
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>WEEKLY SUMMARY</div>
              <div style={s.weekBadge}>{winsThisWeek}/7 WINS</div>
            </div>
            <div style={s.weekGrid}>
              {weekDays.map(d => (
                <div key={d.key} style={{ ...s.weekDay, ...(d.isToday ? s.weekDayToday : {}), ...(d.isFuture ? s.weekDayFuture : {}) }}>
                  <div style={s.weekDayLabel}>{d.label}</div>
                  <div style={s.weekDayDate}>{d.date}</div>
                  {d.data && !d.isFuture ? (
                    <>
                      <div style={{ fontSize: 20, margin: "6px 0" }}>{d.data.won ? "🔥" : "○"}</div>
                      <div style={{ ...s.weekDayXP, color: d.data.won ? "#facc15" : "#555" }}>{d.data.xp} XP</div>
                      <div style={s.weekDayTasks}>{d.data.completed}/{d.data.total}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 20, margin: "6px 0", opacity: 0.2 }}>—</div>
                  )}
                </div>
              ))}
            </div>
            <div style={s.weekStats}>
              {[
                { label: "WINS THIS WEEK", val: `${winsThisWeek}/7`, color: "#f97316" },
                { label: "XP THIS WEEK", val: xpThisWeek, color: "#facc15" },
                { label: "CURRENT STREAK", val: `${streak} days`, color: "#34d399" },
                { label: "TOTAL XP ALL TIME", val: points, color: "#a78bfa" },
              ].map(st => (
                <div key={st.label} style={s.weekStatCard}>
                  <div style={{ ...s.weekStatVal, color: st.color }}>{st.val}</div>
                  <div style={s.weekStatLabel}>{st.label}</div>
                </div>
              ))}
            </div>
            <div style={s.weekMotivation}>
              {winsThisWeek >= 6 ? "🏆 ELITE WEEK — You're operating at the highest level." :
               winsThisWeek >= 4 ? "🔥 SOLID WEEK — Keep building. Don't let off the gas." :
               winsThisWeek >= 2 ? "⚡ TRENDING UP — More consistency = more compound results." :
               "💪 GET BACK UP — One bad week doesn't define you. Execute today."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: { minHeight: "100vh", background: "#080808", color: "#e8e0d0", fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif", position: "relative" },
  container: { maxWidth: 720, margin: "0 auto", padding: "20px 14px 60px" },
  winOverlay: { position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.92)" },
  winTitle: { fontSize: 52, fontWeight: 900, color: "#f97316", letterSpacing: 6, textTransform: "uppercase" },
  winSub: { fontSize: 18, color: "#facc15", marginTop: 8, letterSpacing: 3 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, borderBottom: "2px solid #f97316", paddingBottom: 16 },
  headerEyebrow: { fontSize: 10, letterSpacing: 5, color: "#f97316", marginBottom: 4 },
  headerTitle: { fontSize: 38, fontWeight: 900, letterSpacing: 3, lineHeight: 1.05, textTransform: "uppercase" },
  headerRight: { textAlign: "right" },
  headerDate: { fontSize: 12, color: "#555", letterSpacing: 2, marginBottom: 4 },
  headerGreeting: { fontSize: 15, color: "#e8e0d0", letterSpacing: 1 },
  syncStatus: { fontSize: 9, letterSpacing: 2, color: "#34d399", marginTop: 4 },
  xpStrip: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 20, alignItems: "center" },
  xpLeft: { flex: 1 },
  xpLabel: { fontSize: 9, letterSpacing: 4, color: "#555", marginBottom: 6 },
  xpBarWrap: { background: "#1a1a1a", borderRadius: 2, height: 5, overflow: "hidden", marginBottom: 6 },
  xpBarFill: { height: "100%", borderRadius: 2, transition: "width .4s ease" },
  xpCount: { fontSize: 11, color: "#666", letterSpacing: 1 },
  xpStats: { display: "flex", gap: 18 },
  xpStat: { textAlign: "center" },
  xpStatNum: { fontSize: 26, fontWeight: 900, lineHeight: 1 },
  xpStatLabel: { fontSize: 8, letterSpacing: 2, color: "#555", marginTop: 2 },
  tabBar: { display: "flex", gap: 2, background: "#111", padding: 3, borderRadius: 6, marginBottom: 16, overflowX: "auto" },
  tabBtn: { flex: 1, minWidth: 70, padding: "9px 4px", fontSize: 9, letterSpacing: 1.5, fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif", background: "transparent", color: "#555", border: "none", borderRadius: 4, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all .2s", textTransform: "uppercase", whiteSpace: "nowrap" },
  tabBtnActive: { background: "#f97316", color: "#000", fontWeight: 700 },
  panel: { display: "flex", flexDirection: "column", gap: 14 },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { fontSize: 11, letterSpacing: 4, color: "#888", textTransform: "uppercase" },
  btnAccent: { background: "#f97316", color: "#000", border: "none", padding: "8px 14px", fontSize: 10, letterSpacing: 2, fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif", cursor: "pointer", borderRadius: 3, fontWeight: 700, textTransform: "uppercase", transition: "opacity .15s" },
  btnAccentSm: { background: "#f97316", color: "#000", border: "none", padding: "4px 10px", fontSize: 10, letterSpacing: 2, fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif", cursor: "pointer", borderRadius: 3, fontWeight: 700 },
  btnGhost: { background: "transparent", border: "1px solid #2a2a2a", color: "#666", padding: "7px 12px", fontSize: 10, letterSpacing: 2, fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif", cursor: "pointer", borderRadius: 3, textTransform: "uppercase" },
  iconBtn: { background: "transparent", border: "1px solid #222", color: "#555", width: 26, height: 26, borderRadius: 3, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" },
  input: { width: "100%", background: "#0d0d0d", border: "1px solid #222", color: "#e8e0d0", padding: "9px 11px", fontSize: 14, borderRadius: 4, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box" },
  select: { background: "#0d0d0d", border: "1px solid #222", color: "#888", padding: "8px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer", fontFamily: "'Barlow Condensed', 'Oswald', Impact, sans-serif" },
  addBox: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, padding: 14 },
  taskCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "13px 14px", display: "flex", alignItems: "flex-start", gap: 12, transition: "all .2s" },
  taskCardDone: { background: "#0d130d", border: "1px solid #1a2a1a", opacity: 0.65 },
  checkBtn: { width: 22, height: 22, minWidth: 22, borderRadius: 4, background: "transparent", border: "2px solid #333", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkBtnDone: { background: "#f97316", border: "2px solid #f97316" },
  taskText: { fontSize: 15, fontFamily: "Georgia, serif", lineHeight: 1.4 },
  taskTextDone: { textDecoration: "line-through", color: "#444" },
  taskMeta: { display: "flex", gap: 8, marginTop: 5, alignItems: "center" },
  catBadge: { fontSize: 9, letterSpacing: 2, padding: "2px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 2 },
  xpBadge: { fontSize: 9, color: "#facc15", letterSpacing: 1 },
  winBanner: { background: "#0d1a0d", border: "1px solid #34d399", borderRadius: 6, padding: 16, textAlign: "center" },
  winBannerTitle: { fontSize: 24, fontWeight: 900, color: "#34d399", letterSpacing: 4 },
  winBannerSub: { fontSize: 10, color: "#888", marginTop: 4, letterSpacing: 2 },
  scoringNote: { fontSize: 10, color: "#333", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  chatWrap: { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 6, padding: 14, minHeight: 320, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 },
  chatEmpty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" },
  chatMsg: { maxWidth: "85%", borderRadius: 6, padding: "10px 14px" },
  chatMsgUser: { background: "#1a1a1a", border: "1px solid #2a2a2a", alignSelf: "flex-end" },
  chatMsgAssistant: { background: "#111", border: "1px solid #f97316", borderLeft: "3px solid #f97316", alignSelf: "flex-start" },
  chatLabel: { fontSize: 8, letterSpacing: 3, color: "#f97316", marginBottom: 5, textTransform: "uppercase" },
  chatText: { fontSize: 14, fontFamily: "Georgia, serif", lineHeight: 1.6, color: "#e8e0d0", whiteSpace: "pre-wrap" },
  chatInputWrap: { display: "flex", gap: 8 },
  promptCard: { background: "#111", border: "1px solid #1e1e1e", borderLeft: "3px solid #a78bfa", borderRadius: 4, padding: 16 },
  promptLabel: { fontSize: 9, letterSpacing: 3, color: "#a78bfa", marginBottom: 8 },
  promptText: { fontSize: 16, fontFamily: "Georgia, serif", lineHeight: 1.6, fontStyle: "italic" },
  textarea: { width: "100%", minHeight: 240, background: "#111", border: "1px solid #1e1e1e", color: "#e8e0d0", padding: 16, fontSize: 15, lineHeight: 1.7, borderRadius: 6, resize: "vertical", fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box" },
  journalMeta: { fontSize: 10, color: "#333", letterSpacing: 1, textAlign: "right" },
  photoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  photoCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, overflow: "hidden" },
  photoImg: { width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" },
  photoInfo: { padding: "10px 12px" },
  photoDate: { fontSize: 11, letterSpacing: 2, color: "#f97316" },
  emptyState: { textAlign: "center", padding: "40px 20px" },
  emptyTitle: { fontSize: 14, letterSpacing: 4, color: "#444", marginBottom: 8 },
  emptyDesc: { fontSize: 13, fontFamily: "Georgia, serif", color: "#333" },
  challengeCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, padding: 16 },
  challengeCardDone: { border: "1px solid #1a3a1a" },
  challengeTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  challengeName: { fontSize: 18, fontWeight: 700, letterSpacing: 1, marginBottom: 4 },
  challengeDesc: { fontSize: 13, fontFamily: "Georgia, serif", color: "#666", lineHeight: 1.5 },
  challengeDayBig: { fontSize: 36, fontWeight: 900, color: "#f97316", textAlign: "center", lineHeight: 1, minWidth: 60 },
  challengeDayLabel: { fontSize: 9, letterSpacing: 2, color: "#555", textAlign: "center" },
  progressWrap: { background: "#1a1a1a", borderRadius: 2, height: 5 },
  progressFill: { height: "100%", borderRadius: 2, transition: "width .4s ease" },
  completedTag: { flex: 1, textAlign: "center", fontSize: 12, color: "#34d399", letterSpacing: 2, padding: "8px 0" },
  weekGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },
  weekDay: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "10px 6px", textAlign: "center" },
  weekDayToday: { border: "1px solid #f97316" },
  weekDayFuture: { opacity: 0.3 },
  weekDayLabel: { fontSize: 9, letterSpacing: 2, color: "#888", textTransform: "uppercase" },
  weekDayDate: { fontSize: 11, color: "#555", marginTop: 2 },
  weekDayXP: { fontSize: 11, fontWeight: 700, letterSpacing: 1 },
  weekDayTasks: { fontSize: 9, color: "#444", marginTop: 2 },
  weekBadge: { fontSize: 11, color: "#f97316", letterSpacing: 3 },
  weekStats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  weekStatCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, padding: "14px 16px" },
  weekStatVal: { fontSize: 28, fontWeight: 900, lineHeight: 1 },
  weekStatLabel: { fontSize: 9, letterSpacing: 2, color: "#555", marginTop: 4 },
  weekMotivation: { background: "#111", border: "1px solid #1e1e1e", borderLeft: "3px solid #f97316", borderRadius: 4, padding: 16, fontSize: 14, fontFamily: "Georgia, serif", lineHeight: 1.6, color: "#aaa" },
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080808; }
  input:focus, textarea:focus, select:focus { border-color: #f97316 !important; }
  button:hover:not(:disabled) { opacity: 0.82; }
  button:disabled { cursor: not-allowed; }
  @keyframes bounce { 0%,60%,100% { transform: translateY(0) } 30% { transform: translateY(-6px) } }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
`;