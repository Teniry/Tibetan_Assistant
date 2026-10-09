import { useState, useEffect, useCallback } from 'react';
import { Loading, MessagePlugin } from 'tdesign-react';
import { ArrowLeft, BookOpen, ChevronRight, ChevronLeft, Layers, Search } from 'lucide-react';
import { apiUrl } from '../api-config';

interface ChapterLearningPageProps {
  onBack: () => void;
  onProgressChange?: (chapter: string, wordIndex: number, wordId?: number) => void;
}

interface Chapter {
  name: string;
  count: number;
}

interface UserKB {
  id: string;
  name: string;
  source_filename: string;
  entry_count: number;
  chapters: string[];
}

interface KBEntry {
  id: number;
  zh: string | null;
  bo: string | null;
  mu: string | null;
  ph: string | null;
  en: string | null;
  cat: string | null;
  question: string | null;
  answer: string | null;
}

interface KBCollection {
  id: string;
  name: string;
  type: 'basic' | 'user';
  total: number;
  chapters: Chapter[];
}

export function ChapterLearningPage({ onBack, onProgressChange }: ChapterLearningPageProps) {
  // 视图层级: 'kbs' -> 选择知识库 -> 'chapters' -> 选择章节 -> 'words' -> 学习
  const [view, setView] = useState<'kbs' | 'chapters' | 'words'>('kbs');

  // 数据
  const [localChapters, setLocalChapters] = useState<Chapter[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [userKBs, setUserKBs] = useState<UserKB[]>([]);
  const [loading, setLoading] = useState(true);

  // 当前选中
  const [selectedKB, setSelectedKB] = useState<KBCollection | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  // 章节词条
  const [words, setWords] = useState<KBEntry[]>([]);
  const [loadingWords, setLoadingWords] = useState(false);

  // 搜索过滤
  const [searchQuery, setSearchQuery] = useState('');

  // 当前词条索引（用于学习模式）
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // 加载知识库数据
  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/kb-chapters')).then(r => r.json()),
      fetch(apiUrl('/api/kb-status')).then(r => r.json()),
      fetch(apiUrl('/api/user-kb/list')).then(r => r.json()).catch(() => []),
    ])
      .then(([chaptersData, statusData, userData]) => {
        if (Array.isArray(chaptersData)) setLocalChapters(chaptersData);
        if (statusData && statusData.total) setLocalTotal(statusData.total);
        if (Array.isArray(userData)) setUserKBs(userData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 选择知识库 → 进入章节列表
  const selectKB = (kb: KBCollection) => {
    setSelectedKB(kb);
    setView('chapters');
  };

  // 选择章节 → 进入学习视图
  const selectChapter = useCallback(async (chapterName: string) => {
    setSelectedChapter(chapterName);
    setView('words');
    setWords([]);
    setCurrentWordIndex(0);
    setSearchQuery('');

    if (!selectedKB) return;
    setLoadingWords(true);
    try {
      let url: string;
      if (selectedKB.type === 'basic') {
        // 基础知识库：用章节名从主表查询
        url = apiUrl(`/api/kb-by-chapter?chapter=${encodeURIComponent(chapterName)}&limit=100`);
      } else {
        // 用户 KB：从用户 KB 内按章节过滤
        url = apiUrl(`/api/user-kb/${selectedKB.id}/entries?limit=200&chapter=${encodeURIComponent(chapterName)}`);
      }

      const r = await fetch(url);
      const data = await r.json();
      if (Array.isArray(data.entries)) {
        setWords(data.entries);
      } else if (Array.isArray(data)) {
        setWords(data);
      } else if (data.entries) {
        setWords(data.entries);
      }
    } catch (err) {
      MessagePlugin.error('加载章节词条失败');
    } finally {
      setLoadingWords(false);
    }
  }, [selectedKB]);

  // 返回上一层
  const goBack = () => {
    if (view === 'words') {
      setView('chapters');
      setSelectedChapter(null);
      setWords([]);
    } else if (view === 'chapters') {
      setView('kbs');
      setSelectedKB(null);
    } else {
      onBack();
    }
  };

  // 过滤后的词条
  const filteredWords = searchQuery
    ? words.filter(w => {
        const q = searchQuery.toLowerCase();
        return (
          (w.zh && w.zh.toLowerCase().includes(q)) ||
          (w.bo && w.bo.includes(searchQuery)) ||
          (w.mu && w.mu.toLowerCase().includes(q)) ||
          (w.en && w.en.toLowerCase().includes(q))
        );
      })
    : words;

  // 当前学习的词条
  const currentWord = filteredWords[currentWordIndex];

  useEffect(() => {
    if (view === 'words' && selectedChapter && currentWord) {
      onProgressChange?.(selectedChapter, currentWordIndex, currentWord.id);
    }
  }, [view, selectedChapter, currentWordIndex, currentWord, onProgressChange]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--td-component-border)' }}>
        <button onClick={goBack} className="p-1 rounded hover:opacity-70">
          <ArrowLeft size={20} style={{ color: '#4b5563' }} />
        </button>
        <BookOpen size={22} style={{ color: '#059669' }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: '#1f2937' }}>
            {view === 'kbs' && '章节学习'}
            {view === 'chapters' && selectedKB?.name}
            {view === 'words' && selectedChapter}
          </h2>
          <p className="text-xs" style={{ color: '#6b7280' }}>
            {view === 'kbs' && '选择一个知识库开始学习'}
            {view === 'chapters' && `${selectedKB?.chapters.length || 0} 个章节，共 ${selectedKB?.total || 0} 条词汇`}
            {view === 'words' && `${filteredWords.length} 个词条`}
          </p>
        </div>
      </div>

      {/* 面包屑 */}
      <div className="px-6 py-2 flex items-center gap-2 text-xs flex-shrink-0" style={{ color: '#4b5563' }}>
        <span>知识库</span>
        {selectedKB && (
          <>
            <ChevronRight size={12} />
            <span>{selectedKB.name}</span>
          </>
        )}
        {selectedChapter && (
          <>
            <ChevronRight size={12} />
            <span style={{ color: '#059669' }}>{selectedChapter}</span>
          </>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loading size="medium" /></div>
          ) : view === 'kbs' ? (
            /* ============ 视图1: 知识库列表 ============ */
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: '#1f2937' }}>
                  <BookOpen size={16} style={{ color: '#d97706' }} />
                  基础知识库
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: '#4b5563' }}>
                    《木雅藏语方言词汇》
                  </span>
                </h3>
                <button
                  onClick={() => selectKB({
                    id: 'basic',
                    name: '《木雅藏语方言词汇》',
                    type: 'basic',
                    total: localTotal,
                    chapters: localChapters,
                  })}
                  className="w-full p-5 rounded-2xl text-left transition-all hover:shadow-md"
                  style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #d97706, #fbbf24)' }}
                    >
                      <BookOpen size={28} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold" style={{ color: '#1f2937' }}>
                          《木雅藏语方言词汇》
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
                          系统内置
                        </span>
                      </div>
                      <div className="text-sm" style={{ color: '#4b5563' }}>
                        共 {localTotal.toLocaleString()} 条词汇 · {localChapters.length} 个章节
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
                        点击浏览章节分类，按主题系统学习
                      </div>
                    </div>
                    <ChevronRight size={20} style={{ color: '#6b7280' }} />
                  </div>
                </button>
              </div>

              {/* 用户上传的知识库 */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: '#1f2937' }}>
                  <Layers size={16} style={{ color: '#0ea5e9' }} />
                  我的知识库
                </h3>
                {userKBs.length === 0 ? (
                  <div
                    className="rounded-2xl p-8 text-center"
                    style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
                  >
                    <Layers size={40} className="mb-3 opacity-30 mx-auto" style={{ color: '#6b7280' }} />
                    <p className="text-sm" style={{ color: '#6b7280' }}>
                      还没有上传的知识库
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                      前往「知识库管理」上传您的词库
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userKBs.map(kb => (
                      <button
                        key={kb.id}
                        onClick={() => selectKB({
                          id: kb.id,
                          name: kb.name,
                          type: 'user',
                          total: kb.entry_count,
                          chapters: kb.chapters.map(c => ({ name: c, count: 0 })),
                        })}
                        className="w-full p-4 rounded-2xl text-left transition-all hover:shadow-md"
                        style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                          >
                            <Layers size={24} color="white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold truncate" style={{ color: '#1f2937' }}>
                                {kb.name}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                                {kb.entry_count} 条
                              </span>
                            </div>
                            <div className="text-xs truncate" style={{ color: '#6b7280' }}>
                              {kb.chapters.length > 0 ? `${kb.chapters.length} 个章节` : '暂无章节分类'} · {kb.source_filename}
                            </div>
                          </div>
                          <ChevronRight size={18} style={{ color: '#6b7280' }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : view === 'chapters' && selectedKB ? (
            /* ============ 视图2: 章节列表 ============ */
            selectedKB.chapters.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#6b7280' }}>
                暂无章节分类
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {selectedKB.chapters.map((ch, idx) => (
                  <button
                    key={ch.name + idx}
                    onClick={() => selectChapter(ch.name)}
                    className="p-4 rounded-xl text-left transition-all hover:shadow-md group"
                    style={{
                      backgroundColor: 'var(--td-bg-color-container)',
                      border: '1px solid var(--td-component-border)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <BookOpen size={18} style={{ color: '#059669' }} className="group-hover:scale-110 transition-transform" />
                      {ch.count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
                          {ch.count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium" style={{ color: '#1f2937' }}>
                      {ch.name}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : view === 'words' && selectedChapter ? (
            /* ============ 视图3: 词条学习 ============ */
            <>
              {/* 搜索框 */}
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
                <Search size={16} style={{ color: '#6b7280' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentWordIndex(0);
                  }}
                  placeholder="搜索词条（中文/藏文/英文）"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: '#1f2937' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-xs" style={{ color: '#6b7280' }}>
                    清除
                  </button>
                )}
              </div>

              {loadingWords ? (
                <div className="flex justify-center py-12"><Loading size="medium" /></div>
              ) : filteredWords.length === 0 ? (
                <div className="text-center py-12" style={{ color: '#6b7280' }}>
                  {searchQuery ? `没有找到包含「${searchQuery}」的词条` : '该章节暂无词条'}
                </div>
              ) : (
                <>
                  {/* 学习模式：单条大字卡片 */}
                  {currentWord && !searchQuery && (
                    <div
                      className="rounded-2xl p-6 mb-4"
                      style={{
                        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.06), rgba(16, 185, 129, 0.03))',
                        border: '1px solid rgba(5, 150, 105, 0.2)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs" style={{ color: '#6b7280' }}>
                          {currentWordIndex + 1} / {filteredWords.length}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setCurrentWordIndex(Math.max(0, currentWordIndex - 1))}
                            disabled={currentWordIndex === 0}
                            className="p-1.5 rounded-lg disabled:opacity-30"
                            style={{ backgroundColor: 'var(--td-bg-color-component)' }}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            onClick={() => setCurrentWordIndex(Math.min(filteredWords.length - 1, currentWordIndex + 1))}
                            disabled={currentWordIndex === filteredWords.length - 1}
                            className="p-1.5 rounded-lg disabled:opacity-30"
                            style={{ backgroundColor: 'var(--td-bg-color-component)' }}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="text-center py-4">
                        {currentWord.bo && (
                          <div
                            className="text-3xl font-bold mb-3"
                            style={{ fontFamily: '"Microsoft Himalaya", "Tibetan Machine Uni", sans-serif', color: '#1f2937' }}
                          >
                            {currentWord.bo}
                          </div>
                        )}
                        {currentWord.zh && (
                          <div className="text-xl mb-2" style={{ color: '#1f2937' }}>
                            {currentWord.zh}
                          </div>
                        )}
                        {currentWord.ph && (
                          <div className="text-base mb-3 italic" style={{ color: '#4b5563' }}>
                            [{currentWord.ph}]
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                          {currentWord.mu && (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: '#4b5563' }}>
                              木雅语：{currentWord.mu}
                            </span>
                          )}
                          {currentWord.en && (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: '#4b5563' }}>
                              {currentWord.en}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 词条列表 */}
                  <div className="text-xs mb-2 px-1" style={{ color: '#4b5563' }}>
                    {searchQuery ? `搜索结果（${filteredWords.length}）` : '全部词条'}
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--td-component-border)' }}>
                    <table className="w-full text-sm">
                      <thead style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium" style={{ color: '#4b5563' }}>藏文</th>
                          <th className="px-3 py-2 text-left font-medium" style={{ color: '#4b5563' }}>中文</th>
                          <th className="px-3 py-2 text-left font-medium" style={{ color: '#4b5563' }}>音标</th>
                          <th className="px-3 py-2 text-left font-medium" style={{ color: '#4b5563' }}>英文</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWords.map((w, idx) => (
                          <tr
                            key={w.id}
                            style={{
                              borderTop: idx > 0 ? '1px solid var(--td-component-border)' : 'none',
                              backgroundColor: idx % 2 === 0 ? 'var(--td-bg-color-container)' : 'var(--td-bg-color-page)',
                            }}
                          >
                            <td className="px-3 py-2" style={{ fontFamily: '"Microsoft Himalaya", "Tibetan Machine Uni", sans-serif', color: '#1f2937' }}>
                              {w.bo || '-'}
                            </td>
                            <td className="px-3 py-2" style={{ color: '#1f2937' }}>{w.zh || '-'}</td>
                            <td className="px-3 py-2 text-xs" style={{ color: '#4b5563' }}>{w.ph || '-'}</td>
                            <td className="px-3 py-2 text-xs italic" style={{ color: '#4b5563' }}>{w.en || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
