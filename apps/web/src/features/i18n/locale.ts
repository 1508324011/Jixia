export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export const appSurfaces = ["home", "search", "library", "projects", "notebook", "ai", "settings"] as const;

export type AppSurface = (typeof appSurfaces)[number];

type DeferredSurface = Extract<AppSurface, "home" | "search" | "library">;

export type ContextTone = "neutral" | "accent" | "success" | "warning";

type ContextItem = {
  readonly label: string;
  readonly meta: string;
  readonly tone?: ContextTone;
};

type LocaleCatalog = {
  readonly locale: {
    readonly label: string;
    readonly english: string;
    readonly simplifiedChinese: string;
  };
  readonly login: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly formKicker: string;
    readonly formTitle: string;
    readonly email: string;
    readonly password: string;
    readonly signIn: string;
    readonly signingIn: string;
    readonly signedIn: string;
    readonly helper: string;
    readonly unableToSignIn: string;
  };
  readonly shell: {
    readonly activityRail: string;
    readonly navigation: string;
    readonly contextSidebar: string;
    readonly currentSession: string;
    readonly context: string;
    readonly brandCopy: string;
    readonly sessionNameFallback: string;
    readonly sessionEmailFallback: string;
    readonly navigationLabels: Record<AppSurface, string>;
    readonly surfaceTitles: Record<AppSurface, string>;
    readonly surfaceContext: Record<AppSurface, readonly ContextItem[]>;
    readonly settingsContext: {
      readonly account: ContextItem;
      readonly ai: ContextItem;
      readonly usage: ContextItem;
    };
  };
  readonly inspector: {
    readonly modes: string;
    readonly copilot: string;
    readonly metadata: string;
    readonly versions: string;
    readonly attachments: string;
  };
  readonly workbench: {
    readonly deferred: Record<
      DeferredSurface,
      {
        readonly eyebrow: string;
        readonly title: string;
        readonly description: string;
      }
    >;
    readonly openProjects: string;
    readonly deferredTitle: string;
    readonly deferredDescription: string;
    readonly settings: {
      readonly eyebrow: string;
      readonly title: string;
      readonly description: string;
      readonly accountTitle: string;
      readonly accountNotice: string;
      readonly name: string;
      readonly email: string;
      readonly space: string;
      readonly unavailable: string;
    };
  };
};

const englishCatalog: LocaleCatalog = {
  locale: {
    label: "Language",
    english: "English",
    simplifiedChinese: "Simplified Chinese"
  },
  login: {
    eyebrow: "Research workspace",
    title: "Continue your research.",
    description: "Return to your projects, notes, and shared research context.",
    formKicker: "Lab access",
    formTitle: "Sign in",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    signedIn: "Signed in. Loading your workspace...",
    helper: "Access is by invitation. Ask your lab administrator for an invitation if you do not have an account.",
    unableToSignIn: "Unable to sign in."
  },
  shell: {
    activityRail: "Activity rail",
    navigation: "Workbench navigation",
    contextSidebar: "Context sidebar",
    currentSession: "Current session",
    context: "Context",
    brandCopy: "Research workspace for lab teams",
    sessionNameFallback: "Researcher",
    sessionEmailFallback: "Session details unavailable",
    navigationLabels: {
      home: "Home",
      search: "Search",
      library: "Library",
      projects: "Projects",
      notebook: "Notebook",
      ai: "AI",
      settings: "Settings"
    },
    surfaceTitles: {
      home: "Home",
      search: "External Search",
      library: "Library",
      projects: "Projects",
      notebook: "Notebook",
      ai: "AI Workspace",
      settings: "Settings"
    },
    surfaceContext: {
      home: [
        { label: "Recent work", meta: "Continue a research thread" },
        { label: "Drafts", meta: "Return to work in progress" },
        { label: "Research activity", meta: "Updates will appear here" }
      ],
      search: [
        { label: "External discovery", meta: "Find research beyond your workspace" },
        { label: "Search filters", meta: "Refine a research question" },
        { label: "Saved searches", meta: "Keep useful discovery paths" }
      ],
      library: [
        { label: "Literature", meta: "Your collected research sources" },
        { label: "Collections", meta: "Organize material by topic" },
        { label: "Imports", meta: "Bring new sources into view" }
      ],
      projects: [
        { label: "Project explorer", meta: "Shared research spaces", tone: "accent" },
        { label: "Documents", meta: "Develop shared knowledge" },
        { label: "Review", meta: "Resolve open decisions" }
      ],
      notebook: [
        { label: "Notebook documents", meta: "Personal research thinking", tone: "accent" },
        { label: "Drafts", meta: "Develop ideas in progress" },
        { label: "Research files", meta: "Keep supporting material close" }
      ],
      ai: [
        { label: "Research assistant", meta: "Explore complex questions", tone: "accent" },
        { label: "Model connections", meta: "Choose available assistance" },
        { label: "Your judgment", meta: "Suggestions remain under your control" }
      ],
      settings: [
        { label: "Account", meta: "Profile and research space" },
        { label: "AI connections", meta: "Available models and access", tone: "accent" },
        { label: "Usage", meta: "Understand research assistance activity" }
      ]
    },
    settingsContext: {
      account: { label: "Account", meta: "Profile and research space" },
      ai: { label: "AI connections", meta: "Available models and access", tone: "accent" },
      usage: { label: "Usage", meta: "Research assistance activity" }
    }
  },
  inspector: {
    modes: "Inspector modes",
    copilot: "Copilot",
    metadata: "Metadata",
    versions: "Versions",
    attachments: "Attachments"
  },
  workbench: {
    deferred: {
      home: {
        eyebrow: "Daily workspace",
        title: "Home is being prepared for your research day.",
        description: "A focused view of recent projects, drafts, and research activity will open here in a future release."
      },
      search: {
        eyebrow: "External discovery",
        title: "Search is being prepared for literature discovery.",
        description: "A dedicated place to find and revisit research beyond your workspace will open here in a future release."
      },
      library: {
        eyebrow: "Personal literature",
        title: "Library is being prepared for your collected sources.",
        description: "A dedicated place to organize literature, collections, and imports will open here in a future release."
      }
    },
    openProjects: "Open Projects",
    deferredTitle: "This workspace is still taking shape",
    deferredDescription: "Projects remains available for active research while this area is prepared.",
    settings: {
      eyebrow: "Workspace preferences",
      title: "Settings",
      description: "Choose a section from the Context sidebar to manage your profile or research-assistance preferences.",
      accountTitle: "Account and profile",
      accountNotice: "Your current profile and research space details appear below.",
      name: "Name",
      email: "Email",
      space: "Space",
      unavailable: "Not available"
    }
  }
};

const simplifiedChineseCatalog: LocaleCatalog = {
  locale: {
    label: "语言",
    english: "English",
    simplifiedChinese: "简体中文"
  },
  login: {
    eyebrow: "研究工作台",
    title: "继续推进你的研究。",
    description: "回到你的项目、笔记和共享研究上下文。",
    formKicker: "实验室访问",
    formTitle: "登录",
    email: "邮箱",
    password: "密码",
    signIn: "登录",
    signingIn: "正在登录...",
    signedIn: "登录成功，正在加载工作台...",
    helper: "访问需要邀请。如果你还没有账户，请向实验室管理员申请邀请。",
    unableToSignIn: "无法登录。"
  },
  shell: {
    activityRail: "活动栏",
    navigation: "工作台导航",
    contextSidebar: "上下文侧栏",
    currentSession: "当前会话",
    context: "上下文",
    brandCopy: "面向实验室团队的研究工作台",
    sessionNameFallback: "研究者",
    sessionEmailFallback: "会话详情暂不可用",
    navigationLabels: {
      home: "首页",
      search: "搜索",
      library: "文献库",
      projects: "项目",
      notebook: "笔记本",
      ai: "AI",
      settings: "设置"
    },
    surfaceTitles: {
      home: "首页",
      search: "外部搜索",
      library: "文献库",
      projects: "项目",
      notebook: "笔记本",
      ai: "AI 工作区",
      settings: "设置"
    },
    surfaceContext: {
      home: [
        { label: "最近工作", meta: "继续一个研究线索" },
        { label: "草稿", meta: "回到进行中的工作" },
        { label: "研究动态", meta: "更新将在这里显示" }
      ],
      search: [
        { label: "外部发现", meta: "在工作台外发现研究资料" },
        { label: "搜索筛选", meta: "聚焦研究问题" },
        { label: "已保存搜索", meta: "保留有价值的发现路径" }
      ],
      library: [
        { label: "文献", meta: "你收集的研究来源" },
        { label: "集合", meta: "按主题整理材料" },
        { label: "导入", meta: "将新来源加入视野" }
      ],
      projects: [
        { label: "项目浏览器", meta: "共享研究空间", tone: "accent" },
        { label: "文档", meta: "共同沉淀知识" },
        { label: "审阅", meta: "处理待定决策" }
      ],
      notebook: [
        { label: "笔记本文档", meta: "个人研究思考", tone: "accent" },
        { label: "草稿", meta: "逐步形成想法" },
        { label: "研究文件", meta: "让辅助材料保持在手边" }
      ],
      ai: [
        { label: "研究助手", meta: "探索复杂问题", tone: "accent" },
        { label: "模型连接", meta: "选择可用的辅助能力" },
        { label: "你的判断", meta: "建议始终由你决定如何使用" }
      ],
      settings: [
        { label: "账户", meta: "个人资料和研究空间" },
        { label: "AI 连接", meta: "可用模型和访问权限", tone: "accent" },
        { label: "使用情况", meta: "了解研究辅助活动" }
      ]
    },
    settingsContext: {
      account: { label: "账户", meta: "个人资料和研究空间" },
      ai: { label: "AI 连接", meta: "可用模型和访问权限", tone: "accent" },
      usage: { label: "使用情况", meta: "研究辅助活动" }
    }
  },
  inspector: {
    modes: "检查器模式",
    copilot: "助手",
    metadata: "元数据",
    versions: "版本",
    attachments: "附件"
  },
  workbench: {
    deferred: {
      home: {
        eyebrow: "每日工作台",
        title: "首页正在为你的研究日程做准备。",
        description: "未来版本将在这里集中呈现最近项目、草稿和研究动态。"
      },
      search: {
        eyebrow: "外部发现",
        title: "搜索正在为文献发现做准备。",
        description: "未来版本将在这里提供专门的空间，用于查找和回顾工作台之外的研究资料。"
      },
      library: {
        eyebrow: "个人文献",
        title: "文献库正在为你收集的研究资料做准备。",
        description: "未来版本将在这里提供专门的空间，用于整理文献、集合和导入内容。"
      }
    },
    openProjects: "打开项目",
    deferredTitle: "这个工作区仍在完善中",
    deferredDescription: "在此区域准备期间，你仍可在项目中继续当前研究。",
    settings: {
      eyebrow: "工作台偏好",
      title: "设置",
      description: "从上下文侧栏选择一个部分，管理你的个人资料或研究辅助偏好。",
      accountTitle: "账户与个人资料",
      accountNotice: "下方显示你当前的个人资料和研究空间信息。",
      name: "姓名",
      email: "邮箱",
      space: "空间",
      unavailable: "暂不可用"
    }
  }
};

const catalogs: Readonly<Record<Locale, LocaleCatalog>> = {
  en: englishCatalog,
  "zh-CN": simplifiedChineseCatalog
};

export function localeCatalog(locale: Locale): LocaleCatalog {
  return catalogs[locale];
}

export function defaultLocaleForLanguage(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function browserDefaultLocale(): Locale {
  return defaultLocaleForLanguage(typeof navigator === "undefined" ? undefined : navigator.language);
}

export function synchronizeDocumentLanguage(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}
