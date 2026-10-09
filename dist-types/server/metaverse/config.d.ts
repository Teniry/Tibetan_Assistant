declare const CONFIG_FILE: string;
export interface TopBarTool {
    id: string;
    icon: string;
    label: string;
    enabled?: boolean;
    type?: 'audio' | 'info' | 'back' | 'home' | 'settings' | 'link';
    target?: string;
}
export interface SpaceResource {
    id: string;
    name: string;
    type: 'video' | 'document' | 'image' | 'other';
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: number;
    description?: string;
    usage?: 'exam' | 'explanation' | 'reference';
}
export type AssistantMode = 'assessment' | 'language-learning' | 'culture-guide' | 'general';
export type ActionButtonBehavior = 'resources' | 'link' | 'audio' | 'video' | 'document' | 'info' | 'custom';
export interface SpaceActionButton {
    id: string;
    icon: string;
    label: string;
    enabled?: boolean;
    size?: number;
    position?: {
        x: number;
        y: number;
    };
    bgColor?: string;
    iconColor?: string;
    borderColor?: string;
    action?: ActionButtonBehavior;
    target?: string;
    badge?: number;
    files?: SpaceResource[];
}
export interface CarouselImage {
    id: string;
    imageUrl: string;
    title: string;
    description: string;
    sourceUrl?: string;
    sourceName?: string;
}
export interface PortalPoint {
    id: string;
    name: string;
    gifUrl: string;
    waveGifUrl?: string;
    pageTitle?: string;
    homePosition?: {
        x: number;
        y: number;
    };
    portalPosition?: {
        x: number;
        y: number;
    };
    portalBg?: string;
    ragflow?: {
        enabled?: boolean;
        datasetId?: string;
        welcomeMessage?: string;
        title?: string;
    };
    enabled?: boolean;
    label?: string;
    order?: number;
    size?: number;
    portalSize?: number;
    chatWidth?: number;
    chatHeight?: number;
    chatFontSize?: number;
    subtitle?: string;
    homeLabelPosition?: 'top' | 'bottom';
    homeLabelStyle?: 'bubble' | 'card';
    labelOffsetY?: number;
    labelOffsetX?: number;
    showName?: boolean;
    showSubtitle?: boolean;
    topBarTitle?: string;
    topBarColor?: string;
    topBarTextColor?: string;
    topBarTools?: TopBarTool[];
    showTopBar?: boolean;
    showTopBarTools?: boolean;
    topBarButtonBg?: string;
    topBarButtonHoverBg?: string;
    topBarButtonColor?: string;
    topBarButtonBorderColor?: string;
    topBarButtonSize?: number;
    topBarButtonShape?: 'circle' | 'square';
    speakAnimEnabled?: boolean;
    voiceRole?: 'middle-aged-man' | 'sunny-boy' | 'cheerful-girl';
    voiceName?: string;
    voiceRate?: number;
    voicePitch?: number;
    systemPrompt?: string;
    assistantMode?: AssistantMode;
    quickPrompts?: string[];
    quizEnabled?: boolean;
    quizQuestionCount?: number;
    allowWebSearch?: boolean;
    chatAccentColor?: string;
    chatPanelColor?: string;
    chatTextColor?: string;
    chatMutedTextColor?: string;
    resources?: SpaceResource[];
    actionButtons?: SpaceActionButton[];
    resourcesBtnSize?: number;
    resourcesBtnPosition?: {
        x: number;
        y: number;
    };
    carouselImages?: CarouselImage[];
    carouselEnabled?: boolean;
    carouselPosition?: 'above' | 'below' | 'left' | 'right' | 'inline';
    carouselAlign?: 'left' | 'center' | 'right';
    /** @deprecated 兼容旧版坐标式 */
    carouselOldPosition?: {
        x: number;
        y: number;
    };
    /** @deprecated 兼容旧版宽度 */
    carouselOldWidth?: number;
}
export interface LLMConfig {
    enabled?: boolean;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
}
export interface WebSearchConfig {
    enabled?: boolean;
    provider?: 'tavily';
    apiKey?: string;
    trustedDomains?: string[];
    maxResults?: number;
}
export interface AppConfig {
    version: 1;
    homeBg: string;
    homeTitle: string;
    homeSubtitle?: string;
    defaultPortalBg: string;
    ragflow: {
        apiKey: string;
        baseUrl: string;
        datasetName: string;
        model?: string;
    };
    llm?: LLMConfig;
    webSearch?: WebSearchConfig;
    points: PortalPoint[];
    menu?: {
        id: string;
        name: string;
        icon?: string;
        position?: {
            x: number;
            y: number;
        };
    }[];
    updatedAt: number;
}
declare function readConfig(): AppConfig;
declare function writeConfig(cfg: AppConfig): void;
declare const router: import("express-serve-static-core").Router;
export { readConfig, writeConfig, CONFIG_FILE };
export default router;
