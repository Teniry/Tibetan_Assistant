import { useRef, useCallback, useState, useEffect } from 'react';
import { Select, Tooltip, Tag } from 'tdesign-react';
import { ChatSender } from '@tdesign-react/chat';
import { ChevronDownIcon, LockOnIcon, LockOffIcon, EditIcon, TaskIcon } from 'tdesign-icons-react';
import { Mic, Square } from 'lucide-react';
import { Model, PermissionMode } from '../types';

interface ChatInputProps {
  inputValue: string;
  selectedModel: string;
  models: Model[];
  isLoading: boolean;
  permissionMode: PermissionMode;
  onSend: (message: string) => void;
  onStop: () => void;
  onChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
}

// 权限模式配置
const PERMISSION_MODE_CONFIG: Record<PermissionMode, { 
  label: string; 
  shortLabel: string;
  icon: React.ReactNode; 
  color: string;
  description: string;
}> = {
  'default': { 
    label: '默认模式', 
    shortLabel: '默认',
    icon: <LockOnIcon />, 
    color: '#0052d9',
    description: '每次操作都需要确认'
  },
  'acceptEdits': { 
    label: '自动编辑', 
    shortLabel: '自动编辑',
    icon: <EditIcon />, 
    color: '#2ba471',
    description: '自动允许文件编辑操作'
  },
  'plan': { 
    label: '仅规划', 
    shortLabel: '仅规划',
    icon: <TaskIcon />, 
    color: '#ed7b2f',
    description: '只生成计划，不执行操作'
  },
  'bypassPermissions': { 
    label: '全部允许', 
    shortLabel: '全部允许',
    icon: <LockOffIcon />, 
    color: '#e34d59',
    description: '跳过所有权限确认（危险）'
  },
};

// Web Speech API 类型声明
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function ChatInput({
  inputValue,
  selectedModel,
  models,
  isLoading,
  permissionMode,
  onSend,
  onStop,
  onChange,
  onModelChange,
  onPermissionModeChange,
}: ChatInputProps) {
  const chatSenderRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // 检测浏览器是否支持语音识别
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
    }
  }, []);

  // 开始语音录入
  const startRecording = useCallback((lang: string) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event: any) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      const currentText = finalText + interimText;
      onChange(currentText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        onChange((inputValue || '') + '\n[麦克风权限被拒绝，请在浏览器设置中允许麦克风访问]');
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, [onChange]);

  // 停止语音录入
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleSend = useCallback((e: any) => {
    const content = e?.detail?.message || e?.detail || e?.message || inputValue;
    if (content && typeof content === 'string' && content.trim() && selectedModel) {
      onSend(content.trim());
    } else if (inputValue.trim() && selectedModel) {
      onSend(inputValue.trim());
    }
  }, [inputValue, selectedModel, onSend]);

  const handleChange = useCallback((e: any) => {
    const value = e?.detail ?? e ?? '';
    onChange(typeof value === 'string' ? value : '');
  }, [onChange]);

  const currentModeConfig = PERMISSION_MODE_CONFIG[permissionMode];

  return (
    <div 
      className="px-4 pb-6 pt-4"
      style={{ 
        backgroundColor: 'var(--td-bg-color-page)'
      }}
    >
      <div className="max-w-3xl mx-auto">
        <ChatSender
          ref={chatSenderRef}
          value={inputValue}
          placeholder={isRecording ? "正在录音...请说话" : "输入消息，或点击麦克风语音输入..."}
          disabled={!selectedModel}
          loading={isLoading}
          autosize={{ minRows: 1, maxRows: 6 }}
          actions={['send']}
          onSend={handleSend}
          onStop={onStop}
          onChange={handleChange}
        >
          <div slot="footer-prefix" className="flex items-center gap-2">
            {/* 语音输入按钮组 */}
            {voiceSupported && (
              <div className="flex items-center">
                <Tooltip content={isRecording ? "停止录音" : `语音输入 (${voiceLang === 'zh-CN' ? '中文' : 'English'})`}>
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : () => startRecording(voiceLang)}
                    className="flex items-center justify-center w-8 h-8 rounded-full transition-all relative"
                    style={{
                      backgroundColor: isRecording 
                        ? 'rgba(220, 38, 38, 0.15)' 
                        : 'var(--td-bg-color-component)',
                      color: isRecording ? '#dc2626' : 'var(--td-text-color-secondary)',
                      border: isRecording ? '1px solid #dc2626' : '1px solid transparent',
                      borderTopRightRadius: '0px',
                      borderBottomRightRadius: '0px',
                    }}
                  >
                    {isRecording ? (
                      <>
                        <Square size={14} color="#dc2626" />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: '#dc2626', animation: 'recording-pulse 1s ease-in-out infinite' }} 
                        />
                      </>
                    ) : (
                      <Mic size={16} />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="切换语音语言">
                  <button
                    type="button"
                    onClick={() => {
                      setVoiceLang(prev => prev === 'zh-CN' ? 'en-US' : 'zh-CN');
                    }}
                    className="flex items-center justify-center w-6 h-8 rounded-r-full text-[10px] font-semibold transition-all"
                    style={{
                      backgroundColor: 'var(--td-bg-color-component)',
                      color: 'var(--td-text-color-secondary)',
                      border: '1px solid transparent',
                      borderLeft: '1px solid var(--td-component-stroke)',
                    }}
                  >
                    {voiceLang === 'zh-CN' ? '中' : 'EN'}
                  </button>
                </Tooltip>
              </div>
            )}
            
            {/* 不支持语音时的提示 */}
            {!voiceSupported && (
              <Tooltip content="浏览器不支持语音识别（请使用 Chrome 浏览器）">
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded-full opacity-30 cursor-not-allowed"
                  style={{ backgroundColor: 'var(--td-bg-color-component)' }}
                >
                  <Mic size={16} />
                </div>
              </Tooltip>
            )}
            
            {/* 分隔线 */}
            {voiceSupported && (
              <div 
                className="h-4 w-px"
                style={{ backgroundColor: 'var(--td-component-stroke)' }}
              />
            )}
            
            {/* 模型选择器 */}
            {models.length > 1 ? (
              <Select
                value={selectedModel}
                onChange={(value) => onModelChange(value as string)}
                placeholder="选择模型"
                size="small"
                style={{ width: 160 }}
                borderless
              >
                {models.map(model => (
                  <Select.Option key={model.modelId} value={model.modelId} label={model.name} />
                ))}
              </Select>
            ) : (
              <Tag theme="primary" variant="light-outline">
                {models[0]?.name || '通义千问 Turbo'}
              </Tag>
            )}
            
            {/* 分隔线 */}
            <div 
              className="h-4 w-px"
              style={{ backgroundColor: 'var(--td-component-stroke)' }}
            />
            
            {/* 权限模式选择器 */}
            <Tooltip content={currentModeConfig.description} placement="top">
              <Select
                value={permissionMode}
                onChange={(value) => onPermissionModeChange(value as PermissionMode)}
                size="small"
                style={{ width: 110 }}
                borderless
                suffixIcon={<ChevronDownIcon />}
                prefixIcon={
                  <span style={{ color: currentModeConfig.color }}>
                    {currentModeConfig.icon}
                  </span>
                }
                popupProps={{
                  overlayInnerStyle: { width: 140 }
                }}
              >
                {(Object.keys(PERMISSION_MODE_CONFIG) as PermissionMode[]).map(mode => {
                  const config = PERMISSION_MODE_CONFIG[mode];
                  return (
                    <Select.Option 
                      key={mode} 
                      value={mode} 
                      label={config.shortLabel}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: config.color }}>{config.icon}</span>
                        <span>{config.shortLabel}</span>
                      </div>
                    </Select.Option>
                  );
                })}
              </Select>
            </Tooltip>
          </div>
        </ChatSender>
      </div>
    </div>
  );
}
