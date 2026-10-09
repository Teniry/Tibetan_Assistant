// 空间功能按钮图标统一组件
// 输入 icon 是字符串：
//   - lucide 图标名（如 'Paperclip' / 'FileText' / 'Volume2' / 'Video' / 'BookOpen' ...）
//   - 或者 emoji / 任意字符（直接按文字显示）
// 用于 PortalPage 和 ConfigPage 预览，保证两边图标一致。
import React from 'react';
import {
  Paperclip,
  FileText,
  Volume2,
  Video,
  Music,
  Film,
  Image as ImageIcon,
  BookOpen,
  Headphones,
  Mic,
  PlayCircle,
  Award,
  HelpCircle,
  Info,
  Settings as SettingsIcon,
  Download,
  Upload,
  Link as LinkIcon,
  ExternalLink,
  Home as HomeIcon,
  ChevronRight,
  Plus,
  Star,
  Heart,
  Bookmark,
  Calendar,
  Clock,
  Eye,
  Search,
  Globe,
  MessageSquare,
  Mail,
  Phone,
  Share2,
  Edit,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

// lucide 图标名 → 组件映射（按"空间场景常用"挑选 + 通用）
const ICON_MAP: Record<string, LucideIcon> = {
  Paperclip, FileText, Volume2, Video, Music, Film, ImageIcon, BookOpen,
  Headphones, Mic, PlayCircle, Award, HelpCircle, Info, SettingsIcon,
  Download, Upload, LinkIcon, ExternalLink, HomeIcon, ChevronRight, Plus,
  Star, Heart, Bookmark, Calendar, Clock, Eye, Search, Globe,
  MessageSquare, Mail, Phone, Share2, Edit, Trash2,
};

export function ActionButtonIcon({
  name,
  size = 18,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Cmp = ICON_MAP[name];
  if (Cmp) {
    return <Cmp size={size} className={className} style={style} />;
  }
  // 非 lucide 名：按 emoji / 文字显示
  return (
    <span
      className={className}
      style={{
        fontSize: Math.max(12, Math.round(size * 0.85)),
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

// 供配置页下拉框使用
export const ACTION_BUTTON_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'Paperclip', label: '📎 附件（Paperclip）' },
  { value: 'FileText', label: '📄 文档（FileText）' },
  { value: 'Volume2', label: '🔊 喇叭（Volume2）' },
  { value: 'Video', label: '🎬 视频（Video）' },
  { value: 'Music', label: '🎵 音乐（Music）' },
  { value: 'Film', label: '🎞️ 胶片（Film）' },
  { value: 'ImageIcon', label: '🖼️ 图片（Image）' },
  { value: 'BookOpen', label: '📖 书本（BookOpen）' },
  { value: 'Headphones', label: '🎧 耳机（Headphones）' },
  { value: 'Mic', label: '🎤 麦克风（Mic）' },
  { value: 'PlayCircle', label: '▶️ 播放（PlayCircle）' },
  { value: 'Award', label: '🏆 奖杯（Award）' },
  { value: 'HelpCircle', label: '❓ 帮助（HelpCircle）' },
  { value: 'Info', label: 'ℹ️ 信息（Info）' },
  { value: 'SettingsIcon', label: '⚙️ 设置（Settings）' },
  { value: 'Download', label: '⬇️ 下载（Download）' },
  { value: 'Upload', label: '⬆️ 上传（Upload）' },
  { value: 'ExternalLink', label: '🔗 外链（ExternalLink）' },
  { value: 'HomeIcon', label: '🏠 主页（Home）' },
  { value: 'Calendar', label: '📅 日历（Calendar）' },
  { value: 'Clock', label: '🕐 时钟（Clock）' },
  { value: 'Eye', label: '👁️ 查看（Eye）' },
  { value: 'Search', label: '🔍 搜索（Search）' },
  { value: 'Globe', label: '🌐 网络（Globe）' },
  { value: 'MessageSquare', label: '💬 消息（MessageSquare）' },
  { value: 'Bookmark', label: '🔖 书签（Bookmark）' },
  { value: 'Star', label: '⭐ 星标（Star）' },
  { value: 'Heart', label: '❤️ 收藏（Heart）' },
  // 常用 emoji（直接当 icon 字符串）
  { value: '📝', label: '📝 笔记' },
  { value: '🎓', label: '🎓 毕业帽' },
  { value: '📚', label: '📚 书本' },
  { value: '🗣️', label: '🗣️ 说话' },
  { value: '🧑‍🏫', label: '🧑‍🏫 老师' },
  { value: '🌐', label: '🌐 地球' },
];