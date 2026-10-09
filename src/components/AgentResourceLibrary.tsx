import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Film, FolderOpen, Image as ImageIcon, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { getPortal } from '../metaverse/api';
import type { PortalPoint, SpaceResource } from '../metaverse/types';
import type { DigitalHumanId } from '../digital-humans';

interface AgentResourceLibraryProps {
  agentId: DigitalHumanId;
}

function collectResources(point: PortalPoint | null): SpaceResource[] {
  if (!point) return [];
  const candidates = [
    ...(point.resources || []),
    ...(point.actionButtons || []).flatMap((button) => button.files || []),
  ];
  const seen = new Set<string>();
  return candidates.filter((resource) => {
    const key = resource.id || resource.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resourceLabel(resource: SpaceResource): string {
  if (resource.type === 'video') return '视频讲解';
  if (resource.type === 'image') return '图片资料';
  if (resource.type === 'document') return '文档资料';
  return '其他文件';
}

export function AgentResourceLibrary({ agentId }: AgentResourceLibraryProps) {
  const [point, setPoint] = useState<PortalPoint | null>(null);
  const [activeResource, setActiveResource] = useState<SpaceResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getPortal(agentId) as { point: PortalPoint };
      setPoint(payload.point);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.message || '资源配置读取失败');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resources = useMemo(() => collectResources(point), [point]);

  return (
    <div className="agent-resource-library">
      <header className="agent-resource-library__header">
        <div>
          <span><FolderOpen size={15} /> 与3D空间同步</span>
          <h3>视频讲解与文档资料</h3>
          <p>资源来自同一配置页面；在3D空间上传或修改后，2D工作台同步生效。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="agent-spin" size={15} /> : <RefreshCw size={15} />} 刷新资源
        </button>
      </header>

      {error && <div className="agent-resource-empty is-error">{error}</div>}
      {!error && loading && <div className="agent-resource-empty"><LoaderCircle className="agent-spin" size={22} /> 正在读取空间资源……</div>}
      {!error && !loading && resources.length === 0 && (
        <div className="agent-resource-empty">
          <FolderOpen size={28} />
          <strong>当前数字人还没有配置资源</strong>
          <span>请在3D空间配置页面为该数字人的视频或文档按钮上传文件。</span>
        </div>
      )}

      {!loading && resources.length > 0 && (
        <div className="agent-resource-grid">
          {resources.map((resource) => (
            <button key={resource.id || resource.url} type="button" onClick={() => setActiveResource(resource)}>
              <i className={`is-${resource.type}`}>
                {resource.type === 'video' ? <Film size={22} />
                  : resource.type === 'image' ? <ImageIcon size={22} />
                    : <FileText size={22} />}
              </i>
              <span>
                <em>{resourceLabel(resource)}</em>
                <strong>{resource.name}</strong>
                <small>{resource.description || '点击在线查看'}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {activeResource && (
        <div className="agent-resource-modal" role="dialog" aria-modal="true" aria-label={activeResource.name} onClick={() => setActiveResource(null)}>
          <div className="agent-resource-viewer" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{activeResource.name}</strong>
              <div>
                <a href={activeResource.url} download={activeResource.name} title="下载"><Download size={17} /></a>
                <button type="button" onClick={() => setActiveResource(null)} title="关闭"><X size={18} /></button>
              </div>
            </header>
            <main>
              {activeResource.type === 'video' ? (
                <video src={activeResource.url} controls autoPlay />
              ) : activeResource.type === 'image' ? (
                <img src={activeResource.url} alt={activeResource.name} />
              ) : activeResource.mimeType === 'application/pdf' || /\.pdf(?:$|\?)/i.test(activeResource.url) ? (
                <iframe src={activeResource.url} title={activeResource.name} />
              ) : (
                <div className="agent-resource-download-only">
                  <FileText size={44} />
                  <p>该文件类型暂不支持浏览器内预览。</p>
                  <a href={activeResource.url} download={activeResource.name}><Download size={16} /> 下载文件</a>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
