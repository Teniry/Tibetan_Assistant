import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Loading, MessagePlugin } from 'tdesign-react';
import {
  ArrowLeft, Database, Upload, Trash2, BookOpen, FolderTree,
  Eye, EyeOff, ChevronRight, ChevronDown, Layers,
} from 'lucide-react';
import { apiUrl } from '../api-config';

interface KnowledgeBasePageProps {
  onBack: () => void;
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
  created_at: string;
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

export function KnowledgeBasePage({ onBack }: KnowledgeBasePageProps) {
  // 本地基础知识库
  const [localChapters, setLocalChapters] = useState<Chapter[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [localExpanded, setLocalExpanded] = useState(false);

  // 用户上传的知识库
  const [userKBs, setUserKBs] = useState<UserKB[]>([]);
  const [loadingUserKBs, setLoadingUserKBs] = useState(true);
  const [uploading, setUploading] = useState(false);

  // 当前选中的用户 KB（查看条目）
  const [activeUserKB, setActiveUserKB] = useState<UserKB | null>(null);
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载本地章节
  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/kb-chapters')).then(r => r.json()),
      fetch(apiUrl('/api/kb-status')).then(r => r.json()),
    ])
      .then(([chaptersData, statusData]) => {
        if (Array.isArray(chaptersData)) {
          setLocalChapters(chaptersData);
        }
        if (statusData && statusData.total) {
          setLocalTotal(statusData.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLocal(false));
  }, []);

  // 加载用户上传的 KB 列表
  const loadUserKBs = useCallback(async () => {
    setLoadingUserKBs(true);
    try {
      const r = await fetch(apiUrl('/api/user-kb/list'));
      const data = await r.json();
      if (Array.isArray(data)) {
        setUserKBs(data);
      }
    } catch {
      MessagePlugin.error('加载用户知识库失败');
    } finally {
      setLoadingUserKBs(false);
    }
  }, []);

  useEffect(() => {
    loadUserKBs();
  }, [loadUserKBs]);

  // 上传文件
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 校验
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.zip')) {
      MessagePlugin.error('只支持 CSV 或 ZIP 文件');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      MessagePlugin.error('文件不能超过 50MB');
      e.target.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const r = await fetch(apiUrl('/api/user-kb/upload'), {
        method: 'POST',
        body: fd,
      });
      const data = await r.json();
      if (data.success) {
        MessagePlugin.success(`上传成功，新增 ${data.entry_count} 条`);
        await loadUserKBs();
      } else {
        MessagePlugin.error(data.error || '上传失败');
      }
    } catch (err: any) {
      MessagePlugin.error(`上传失败：${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 查看用户 KB 的条目
  const viewUserKB = async (kb: UserKB) => {
    setActiveUserKB(kb);
    setLoadingEntries(true);
    try {
      const r = await fetch(apiUrl(`/api/user-kb/${kb.id}/entries?limit=200`));
      const data = await r.json();
      if (Array.isArray(data.entries)) {
        setEntries(data.entries);
      }
    } catch {
      MessagePlugin.error('加载条目失败');
    } finally {
      setLoadingEntries(false);
    }
  };

  // 删除用户 KB
  const handleDelete = async (kb: UserKB) => {
    const msg = `确定要删除知识库「${kb.name}」吗？将删除该知识库下的 ${kb.entry_count} 条词条，操作不可恢复。`;
    if (!window.confirm(msg)) return;
    try {
      const r = await fetch(apiUrl(`/api/user-kb/${kb.id}`), {
        method: 'DELETE',
      });
      const data = await r.json();
      if (data.success) {
        MessagePlugin.success('已删除');
        if (activeUserKB?.id === kb.id) {
          setActiveUserKB(null);
          setEntries([]);
        }
        await loadUserKBs();
      } else {
        MessagePlugin.error(data.error || '删除失败');
      }
    } catch (err: any) {
      MessagePlugin.error(`删除失败：${err.message}`);
    }
  };

  // 返回列表
  const backToList = () => {
    setActiveUserKB(null);
    setEntries([]);
  };

  // 查看条目页面
  if (activeUserKB) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--td-component-border)' }}>
          <button onClick={backToList} className="p-1 rounded hover:opacity-70">
            <ArrowLeft size={20} style={{ color: 'var(--td-text-color-secondary)' }} />
          </button>
          <Database size={22} style={{ color: '#0ea5e9' }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--td-text-color-primary)' }}>
              {activeUserKB.name}
            </h2>
            <p className="text-xs truncate" style={{ color: 'var(--td-text-color-placeholder)' }}>
              共 {activeUserKB.entry_count} 条词条 · 来自 {activeUserKB.source_filename}
            </p>
          </div>
          <button
            onClick={() => handleDelete(activeUserKB)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}
          >
            <Trash2 size={14} /> 删除
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {loadingEntries ? (
              <div className="flex justify-center py-12"><Loading size="medium" /></div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--td-text-color-placeholder)' }}>
                该知识库暂无条目
              </div>
            ) : (
              <>
                <div className="text-xs mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
                  显示前 {entries.length} 条（最多 200 条）
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--td-component-border)' }}>
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                      <tr>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>中文</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>藏文</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>音标</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>英文</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>章节</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => (
                        <tr
                          key={entry.id}
                          style={{
                            borderTop: idx > 0 ? '1px solid var(--td-component-border)' : 'none',
                            backgroundColor: idx % 2 === 0 ? 'var(--td-bg-color-container)' : 'var(--td-bg-color-page)',
                          }}
                        >
                          <td className="px-4 py-3" style={{ color: 'var(--td-text-color-primary)' }}>{entry.zh || '-'}</td>
                          <td className="px-4 py-3" style={{ fontFamily: '"Microsoft Himalaya", "Tibetan Machine Uni", sans-serif', color: 'var(--td-text-color-primary)' }}>{entry.bo || '-'}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>{entry.ph || '-'}</td>
                          <td className="px-4 py-3 text-xs italic" style={{ color: 'var(--td-text-color-secondary)' }}>{entry.en || '-'}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                              {entry.cat || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 主列表页面
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--td-component-border)' }}>
        <button onClick={onBack} className="p-1 rounded hover:opacity-70">
          <ArrowLeft size={20} style={{ color: 'var(--td-text-color-secondary)' }} />
        </button>
        <Database size={22} style={{ color: '#0ea5e9' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>知识库管理</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* 基础知识库（只读） */}
          <section>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--td-text-color-primary)' }}>
              <BookOpen size={16} style={{ color: '#d97706' }} />
              基础知识库（通用知识库）
              <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}>
                只读
              </span>
            </h3>
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
            >
              {loadingLocal ? (
                <div className="flex justify-center py-8"><Loading size="medium" /></div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-3xl font-bold" style={{ color: 'var(--td-text-color-primary)' }}>
                        {localTotal.toLocaleString()}
                        <span className="text-base font-normal ml-2" style={{ color: 'var(--td-text-color-secondary)' }}>条词汇</span>
                      </div>
                      <div className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
                        《木雅藏语方言词汇》· {localChapters.length} 个章节
                      </div>
                    </div>
                    <button
                      onClick={() => setLocalExpanded(!localExpanded)}
                      className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}
                    >
                      {localExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                      {localExpanded ? '收起章节' : '查看章节'}
                    </button>
                  </div>

                  {localExpanded && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--td-component-border)' }}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                        {localChapters.map(ch => (
                          <div
                            key={ch.name}
                            className="px-3 py-2 rounded-lg flex items-center justify-between"
                            style={{ backgroundColor: 'var(--td-bg-color-page)' }}
                          >
                            <span className="text-sm" style={{ color: 'var(--td-text-color-primary)' }}>{ch.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}>
                              {ch.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* 用户上传的知识库 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--td-text-color-primary)' }}>
                <Layers size={16} style={{ color: '#0ea5e9' }} />
                我的知识库
                <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}>
                  上传 / 查看 / 删除
                </span>
              </h3>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.zip"
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  icon={<Upload size={14} />}
                  theme="primary"
                  style={{ backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }}
                >
                  上传词库
                </Button>
              </div>
            </div>

            <div className="text-xs mb-3 px-1" style={{ color: 'var(--td-text-color-secondary)' }}>
              支持 CSV / ZIP 格式（ZIP 内含 CSV），单个文件 ≤ 50MB。词条格式应包含字段：中文、藏文、木雅语、音标、英文。
            </div>

            <div
              className="rounded-2xl p-4 min-h-[120px]"
              style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}
            >
              {loadingUserKBs ? (
                <div className="flex justify-center py-8"><Loading size="medium" /></div>
              ) : userKBs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--td-text-color-placeholder)' }}>
                  <Database size={40} className="mb-3 opacity-40" />
                  <p className="text-sm">还没有上传的知识库</p>
                  <p className="text-xs mt-1">点击右上角「上传词库」开始添加</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userKBs.map(kb => (
                    <div
                      key={kb.id}
                      className="p-4 rounded-xl flex items-center gap-3 transition-all hover:shadow-sm"
                      style={{ backgroundColor: 'var(--td-bg-color-page)' }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}
                      >
                        <Database size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                            {kb.name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}>
                            {kb.entry_count} 条
                          </span>
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          来自 {kb.source_filename} · 上传于 {new Date(kb.created_at).toLocaleString('zh-CN')}
                        </div>
                        {kb.chapters.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {kb.chapters.slice(0, 5).map(ch => (
                              <span
                                key={ch}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}
                              >
                                {ch}
                              </span>
                            ))}
                            {kb.chapters.length > 5 && (
                              <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                                +{kb.chapters.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => viewUserKB(kb)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all"
                        style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}
                      >
                        <Eye size={12} /> 查看
                      </button>
                      <button
                        onClick={() => handleDelete(kb)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all"
                        style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}