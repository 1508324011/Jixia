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
  readonly aiSettings: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly connections: string;
    readonly loading: string;
    readonly refresh: string;
    readonly newConnection: string;
    readonly configuredConnections: string;
    readonly noConnections: string;
    readonly noConnectionsDescription: string;
    readonly createConnection: string;
    readonly editConnection: string;
    readonly chooseProvider: string;
    readonly connectionDetails: string;
    readonly verification: string;
    readonly synchronization: string;
    readonly modelChoice: string;
    readonly providerName: string;
    readonly customBaseUrl: string;
    readonly customBaseUrlHint: string;
    readonly endpointManaged: string;
    readonly apiKey: string;
    readonly replacementApiKey: string;
    readonly secretHint: string;
    readonly defaultConnection: string;
    readonly saveConnection: string;
    readonly savingConnection: string;
    readonly savedConnection: string;
    readonly replacementKeyRequired: string;
    readonly projects: string;
    readonly usage: string;
    readonly errors: {
      readonly loadConnections: string;
      readonly refresh: string;
      readonly saveConnection: string;
      readonly verifyConnection: string;
      readonly syncCapabilities: string;
      readonly defaultModel: string;
      readonly saveManualModel: string;
      readonly updateModel: string;
      readonly deleteModel: string;
      readonly deleteConnection: string;
    };
    readonly providerKinds: Record<"openai" | "openrouter" | "anthropic" | "openai_compatible", string>;
    readonly providerDescriptions: Record<"openai" | "openrouter" | "anthropic" | "openai_compatible", string>;
    readonly actions: {
      readonly open: string;
      readonly edit: string;
      readonly delete: string;
      readonly verify: string;
      readonly verifying: string;
      readonly retryVerification: string;
      readonly sync: string;
      readonly syncing: string;
      readonly retrySync: string;
      readonly setDefault: string;
      readonly addModel: string;
      readonly saveModel: string;
      readonly cancel: string;
      readonly enable: string;
      readonly disable: string;
    };
    readonly connectionStates: {
      readonly notChecked: string;
      readonly reachable: string;
      readonly unreachable: string;
      readonly verified: string;
      readonly rejected: string;
      readonly unverified: string;
      readonly missingKey: string;
    };
    readonly syncStates: {
      readonly notAttempted: string;
      readonly available: string;
      readonly unsupported: string;
      readonly empty: string;
      readonly rateLimited: string;
      readonly unavailable: string;
      readonly malformed: string;
      readonly fresh: string;
      readonly stale: string;
      readonly never: string;
    };
    readonly connectionHint: string;
    readonly syncHint: string;
    readonly syncRequiresKey: string;
    readonly unsupportedDiscoveryHint: string;
    readonly emptyInventoryHint: string;
    readonly inventory: string;
    readonly selectModel: string;
    readonly noSelectableModel: string;
    readonly defaultModel: string;
    readonly defaultModelSaved: string;
    readonly modelName: string;
    readonly modelIdentifier: string;
    readonly availability: {
      readonly available: string;
      readonly unknown: string;
      readonly unavailable: string;
    };
    readonly origins: {
      readonly manual: string;
      readonly discovered: string;
    };
    readonly capabilities: {
      readonly observed: string;
      readonly unknown: string;
      readonly unsupported: string;
      readonly context: string;
      readonly output: string;
      readonly input: string;
      readonly outputModalities: string;
      readonly parameters: string;
    };
    readonly advanced: string;
    readonly advancedDescription: string;
    readonly displayName: string;
    readonly temperature: string;
    readonly maxTokens: string;
    readonly manualModelHint: string;
    readonly manualModelSaved: string;
    readonly modelUpdated: string;
    readonly modelEnabled: string;
    readonly modelDisabled: string;
    readonly deleteConnectionConfirm: string;
    readonly deleteModelConfirm: string;
    readonly updatedAt: string;
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
  aiSettings: {
    eyebrow: "Personal AI connections",
    title: "Provider connections",
    description: "Connect a provider through Jixia, verify non-billable access, synchronize observed capabilities, then choose a model.",
    connections: "Connections",
    loading: "Loading connections...",
    refresh: "Refresh",
    newConnection: "New connection",
    configuredConnections: "Configured connections",
    noConnections: "No provider connections yet",
    noConnectionsDescription: "Start with a provider connection. Keys are submitted only to Jixia and are never shown again.",
    createConnection: "Create connection",
    editConnection: "Edit connection",
    chooseProvider: "1. Choose provider",
    connectionDetails: "2. Connection details",
    verification: "3. Verify connection",
    synchronization: "4. Synchronize capabilities",
    modelChoice: "5. Choose model",
    providerName: "Connection name",
    customBaseUrl: "Custom HTTPS base URL",
    customBaseUrlHint: "Used only for a custom OpenAI-compatible provider. Jixia validates the destination server-side.",
    endpointManaged: "Endpoint managed by Jixia",
    apiKey: "API key",
    replacementApiKey: "Replacement API key",
    secretHint: "Write-only. Leave this blank to keep an existing server-owned key.",
    defaultConnection: "Use as my default connection",
    saveConnection: "Save connection",
    savingConnection: "Saving connection...",
    savedConnection: "Connection saved. Verify it before synchronizing models.",
    replacementKeyRequired: "Changing the provider identity requires a replacement API key.",
    projects: "Projects",
    usage: "Usage",
    errors: {
      loadConnections: "Unable to load AI connections.",
      refresh: "Unable to refresh AI connections.",
      saveConnection: "Unable to save the provider connection.",
      verifyConnection: "Unable to verify the provider connection.",
      syncCapabilities: "Unable to synchronize provider capabilities.",
      defaultModel: "Unable to set the default model.",
      saveManualModel: "Unable to save the manual model.",
      updateModel: "Unable to update the model.",
      deleteModel: "Unable to delete the model.",
      deleteConnection: "Unable to delete the provider connection."
    },
    providerKinds: {
      openai: "OpenAI",
      openrouter: "OpenRouter",
      anthropic: "Anthropic",
      openai_compatible: "Custom OpenAI-compatible"
    },
    providerDescriptions: {
      openai: "Native OpenAI connection with a Jixia-managed endpoint.",
      openrouter: "OpenRouter account verification and account-aware model inventory.",
      anthropic: "Native Anthropic connection with its provider-specific protocol.",
      openai_compatible: "A custom HTTPS endpoint compatible with the OpenAI models interface."
    },
    actions: {
      open: "Open",
      edit: "Edit",
      delete: "Delete",
      verify: "Verify",
      verifying: "Verifying...",
      retryVerification: "Retry verification",
      sync: "Sync capabilities",
      syncing: "Syncing...",
      retrySync: "Retry sync",
      setDefault: "Set default",
      addModel: "Add manual model",
      saveModel: "Save model",
      cancel: "Cancel",
      enable: "Enable",
      disable: "Disable"
    },
    connectionStates: {
      notChecked: "Not verified",
      reachable: "Transport reachable",
      unreachable: "Transport unavailable",
      verified: "Authentication verified",
      rejected: "Authentication rejected",
      unverified: "Authentication not confirmed",
      missingKey: "A saved key is required"
    },
    syncStates: {
      notAttempted: "Not synchronized",
      available: "Inventory available",
      unsupported: "Discovery unsupported",
      empty: "Empty inventory",
      rateLimited: "Rate limited",
      unavailable: "Inventory unavailable",
      malformed: "Inventory could not be read",
      fresh: "Fresh",
      stale: "Stale",
      never: "Never synchronized"
    },
    connectionHint: "Verification checks transport and authentication without making an inference request.",
    syncHint: "Synchronization records only provider-reported model and capability facts. It does not infer capabilities from model names.",
    syncRequiresKey: "Save a provider key before synchronizing its inventory.",
    unsupportedDiscoveryHint: "This provider does not support model discovery. This does not mean the credentials are invalid; add a manual model in Advanced if you know an authorized model ID.",
    emptyInventoryHint: "The provider returned an empty inventory. Retry later or add a manual fallback in Advanced when appropriate.",
    inventory: "Model inventory",
    selectModel: "Default model",
    noSelectableModel: "No enabled available or unknown model is ready to select.",
    defaultModel: "Default model",
    defaultModelSaved: "Default model saved.",
    modelName: "Model display name",
    modelIdentifier: "Model ID",
    availability: {
      available: "Available",
      unknown: "Availability unknown",
      unavailable: "Unavailable"
    },
    origins: {
      manual: "Manual",
      discovered: "Discovered"
    },
    capabilities: {
      observed: "Observed",
      unknown: "Unknown",
      unsupported: "Unsupported",
      context: "Context",
      output: "Max output",
      input: "Input",
      outputModalities: "Output",
      parameters: "Parameters"
    },
    advanced: "Advanced manual fallback",
    advancedDescription: "Use this only for a provider that cannot report a usable inventory. Temperature and token limits remain here rather than in the connection flow.",
    displayName: "Display name",
    temperature: "Temperature",
    maxTokens: "Max tokens",
    manualModelHint: "Manual IDs are not treated as discovered capabilities; unavailable facts remain unknown unless the server reports otherwise.",
    manualModelSaved: "Manual model saved.",
    modelUpdated: "Model updated.",
    modelEnabled: "Model enabled.",
    modelDisabled: "Model disabled.",
    deleteConnectionConfirm: "Delete {name}? This removes the saved connection and its model profiles.",
    deleteModelConfirm: "Delete {name}?",
    updatedAt: "Updated"
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
  aiSettings: {
    eyebrow: "个人 AI 连接",
    title: "提供商连接",
    description: "通过 Jixia 连接提供商，进行非计费验证，同步已观测能力，再选择模型。",
    connections: "连接",
    loading: "正在加载连接...",
    refresh: "刷新",
    newConnection: "新建连接",
    configuredConnections: "已配置连接",
    noConnections: "尚未配置提供商连接",
    noConnectionsDescription: "先创建提供商连接。密钥仅提交给 Jixia，之后不会再次显示。",
    createConnection: "创建连接",
    editConnection: "编辑连接",
    chooseProvider: "1. 选择提供商",
    connectionDetails: "2. 连接详情",
    verification: "3. 验证连接",
    synchronization: "4. 同步能力",
    modelChoice: "5. 选择模型",
    providerName: "连接名称",
    customBaseUrl: "自定义 HTTPS 基础 URL",
    customBaseUrlHint: "仅用于自定义 OpenAI 兼容提供商。Jixia 会在服务端验证目标地址。",
    endpointManaged: "端点由 Jixia 管理",
    apiKey: "API 密钥",
    replacementApiKey: "替换 API 密钥",
    secretHint: "仅写入。留空会保留已有的服务端密钥。",
    defaultConnection: "设为我的默认连接",
    saveConnection: "保存连接",
    savingConnection: "正在保存连接...",
    savedConnection: "连接已保存。请先验证，再同步模型。",
    replacementKeyRequired: "更改提供商身份时必须填写替换 API 密钥。",
    projects: "项目",
    usage: "用量",
    errors: {
      loadConnections: "无法加载 AI 连接。",
      refresh: "无法刷新 AI 连接。",
      saveConnection: "无法保存提供商连接。",
      verifyConnection: "无法验证提供商连接。",
      syncCapabilities: "无法同步提供商能力。",
      defaultModel: "无法设置默认模型。",
      saveManualModel: "无法保存手动模型。",
      updateModel: "无法更新模型。",
      deleteModel: "无法删除模型。",
      deleteConnection: "无法删除提供商连接。"
    },
    providerKinds: {
      openai: "OpenAI",
      openrouter: "OpenRouter",
      anthropic: "Anthropic",
      openai_compatible: "自定义 OpenAI 兼容提供商"
    },
    providerDescriptions: {
      openai: "使用由 Jixia 管理端点的原生 OpenAI 连接。",
      openrouter: "使用 OpenRouter 账户验证和账户级模型清单。",
      anthropic: "使用提供商专用协议的原生 Anthropic 连接。",
      openai_compatible: "使用兼容 OpenAI 模型接口的自定义 HTTPS 端点。"
    },
    actions: {
      open: "打开",
      edit: "编辑",
      delete: "删除",
      verify: "验证",
      verifying: "正在验证...",
      retryVerification: "重试验证",
      sync: "同步能力",
      syncing: "正在同步...",
      retrySync: "重试同步",
      setDefault: "设为默认",
      addModel: "添加手动模型",
      saveModel: "保存模型",
      cancel: "取消",
      enable: "启用",
      disable: "停用"
    },
    connectionStates: {
      notChecked: "尚未验证",
      reachable: "传输可达",
      unreachable: "传输不可用",
      verified: "身份验证成功",
      rejected: "身份验证被拒绝",
      unverified: "身份验证未确认",
      missingKey: "需要已保存的密钥"
    },
    syncStates: {
      notAttempted: "尚未同步",
      available: "清单可用",
      unsupported: "不支持发现",
      empty: "清单为空",
      rateLimited: "受到速率限制",
      unavailable: "清单不可用",
      malformed: "无法读取清单",
      fresh: "最新",
      stale: "已过期",
      never: "从未同步"
    },
    connectionHint: "验证仅检查传输和身份验证，不会发起推理请求。",
    syncHint: "同步仅记录提供商报告的模型和能力事实，不会从模型名称推断能力。",
    syncRequiresKey: "请先保存提供商密钥，再同步模型清单。",
    unsupportedDiscoveryHint: "该提供商不支持模型发现。这不表示凭据无效；若已知获授权模型 ID，可在高级区域添加手动模型。",
    emptyInventoryHint: "提供商返回了空清单。可稍后重试，或在合适时于高级区域添加手动备用模型。",
    inventory: "模型清单",
    selectModel: "默认模型",
    noSelectableModel: "没有可选择的已启用、可用或状态未知模型。",
    defaultModel: "默认模型",
    defaultModelSaved: "默认模型已保存。",
    modelName: "模型显示名称",
    modelIdentifier: "模型 ID",
    availability: {
      available: "可用",
      unknown: "可用性未知",
      unavailable: "不可用"
    },
    origins: {
      manual: "手动添加",
      discovered: "已发现"
    },
    capabilities: {
      observed: "已观测",
      unknown: "未知",
      unsupported: "不支持",
      context: "上下文",
      output: "最大输出",
      input: "输入",
      outputModalities: "输出",
      parameters: "参数"
    },
    advanced: "高级手动备用设置",
    advancedDescription: "仅当提供商无法报告可用清单时使用。温度和令牌上限保留在这里，而不是放在连接主流程中。",
    displayName: "显示名称",
    temperature: "温度",
    maxTokens: "最大令牌数",
    manualModelHint: "手动 ID 不会被当作已发现能力；除非服务端报告，否则能力事实保持未知。",
    manualModelSaved: "手动模型已保存。",
    modelUpdated: "模型已更新。",
    modelEnabled: "模型已启用。",
    modelDisabled: "模型已停用。",
    deleteConnectionConfirm: "删除 {name}？这会移除保存的连接及其模型配置。",
    deleteModelConfirm: "删除 {name}？",
    updatedAt: "更新时间"
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
