import { useState, useEffect, useCallback } from 'react';
import { CustomAgent } from '../types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'customAgents';

// 木雅语教学系统提示词
const MUYA_SYSTEM_PROMPT = `你是一个专业的木雅藏语AI助手，你的职责是帮助用户学习木雅语。请遵循以下规则：

## 1. 教学结构化输出
对于词汇查询，使用 Markdown 格式生成排版卡片，分别清晰展示以下字段：
- **中文 (zh)**：对应的中文释义
- **藏语 (bo)**：藏文书写形式
- **木雅语 (mu)**：木雅语对应形式
- **国际音标 (ph)**：国际音标标注
- **英文 (en)**：英文翻译
- **章节分类 (cat)**：所属章节或分类

## 2. 语法与教学支持
- 附带发音指导：说明声调、发音部位、常见发音错误
- 语法拆解：对句子进行主谓宾(SOV)结构分析，标注词性和语序
- 日常应用例句：提供 2-3 个贴近生活的实用例句

## 3. 语气引导
- 使用亲切、鼓励的教学口吻
- 对学习者的进步给予肯定
- 适当使用表情符号增加亲和力

## 4. 知识库使用
后端已集成本地知识库，检索结果会自动注入到你的上下文中。
- 如果检索到相关内容，请基于检索结果进行结构化输出和教学
- 如果检索结果为"知识库未收录相关词汇"，使用通用知识回答，并在末尾注明"知识库未收录相关词汇"`;

// 默认的 Agent - 木雅藏语AI助手
const DEFAULT_AGENT: CustomAgent = {
  id: 'default',
  name: '木雅藏语AI助手',
  description: '集成本地知识库的木雅语智能教学 AI 助手',
  systemPrompt: MUYA_SYSTEM_PROMPT,
  icon: 'GraduationCap',
  color: '#7c3aed',
  permissionMode: 'bypassPermissions',
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function useAgents() {
  const [agents, setAgents] = useState<CustomAgent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return [DEFAULT_AGENT, ...parsed.map((a: any) => ({
          ...a,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        }))];
      }
    } catch (e) {
      console.error('Failed to load agents:', e);
    }
    return [DEFAULT_AGENT];
  });

  // 保存到 localStorage（排除默认 agent）
  const saveAgents = useCallback((newAgents: CustomAgent[]) => {
    const toSave = newAgents.filter(a => a.id !== 'default');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, []);

  const addAgent = useCallback((agent: Omit<CustomAgent, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAgent: CustomAgent = {
      ...agent,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setAgents(prev => {
      const updated = [...prev, newAgent];
      saveAgents(updated);
      return updated;
    });
    return newAgent;
  }, [saveAgents]);

  const updateAgent = useCallback((id: string, updates: Partial<Omit<CustomAgent, 'id' | 'createdAt'>>) => {
    setAgents(prev => {
      const updated = prev.map(a => 
        a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a
      );
      saveAgents(updated);
      return updated;
    });
  }, [saveAgents]);

  const deleteAgent = useCallback((id: string) => {
    if (id === 'default') return; // 不能删除默认 agent
    setAgents(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAgents(updated);
      return updated;
    });
  }, [saveAgents]);

  const getAgent = useCallback((id: string) => {
    return agents.find(a => a.id === id);
  }, [agents]);

  return {
    agents,
    addAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    defaultAgent: DEFAULT_AGENT,
  };
}
