import { Brain, Eye, EyeOff, Key, Loader2, Monitor, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface SettingsProps {
    onSave: () => void;
    onCancel: () => void;
}

interface ModelInfo {
    id: string;
    name: string;
    isDefault: boolean;
    supportsReasoningEffort?: boolean;
    supportedReasoningEfforts?: string[];
}

const REASONING_EFFORT_OPTIONS = [
    { value: "low", label: "Low", description: "Minimal thinking, prioritizes speed" },
    { value: "medium", label: "Medium (default)", description: "Balanced, thinks on harder problems" },
    { value: "high", label: "High", description: "Optimal performance, thorough thinking" },
    { value: "xhigh", label: "Extra High", description: "Maximum reasoning depth" },
];

const PROVIDER_TYPE_OPTIONS = [
    { value: "azure", label: "Azure OpenAI" },
    { value: "openai", label: "OpenAI-compatible" },
    { value: "anthropic", label: "Anthropic" },
];

export function Settings({ onSave, onCancel }: SettingsProps) {
    const [headless, setHeadless] = useState(true);
    const [automationMode, setAutomationMode] = useState<string>('playwright-cli');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [orchestratorModel, setOrchestratorModel] = useState<string>("");
    const [reasoningEffort, setReasoningEffort] = useState<string>("medium");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // BYOK Provider state
    const [useProvider, setUseProvider] = useState(false);
    const [providerType, setProviderType] = useState<string>("azure");
    const [providerBaseUrl, setProviderBaseUrl] = useState("");
    const [providerApiKey, setProviderApiKey] = useState("");
    const [providerModel, setProviderModel] = useState("");
    const [providerAzureApiVersion, setProviderAzureApiVersion] = useState("2024-10-21");
    const [providerDisplayName, setProviderDisplayName] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        loadSettings();
        loadModels();
    }, []);

    const loadSettings = async () => {
        try {
            const config = await window.jarvis.config.get();
            setHeadless(config.browser?.headless ?? true);
            setAutomationMode(config.browser?.automationMode || 'playwright-cli');
            setOrchestratorModel(config.orchestrator?.model || "");
            setReasoningEffort(config.orchestrator?.reasoningEffort || "medium");

            // Load provider settings
            if (config.provider?.baseUrl) {
                setUseProvider(true);
                setProviderType(config.provider.type || "azure");
                setProviderBaseUrl(config.provider.baseUrl || "");
                setProviderApiKey(config.provider.apiKey || "");
                setProviderModel(config.provider.model || "");
                setProviderAzureApiVersion(config.provider.azureApiVersion || "2024-10-21");
                setProviderDisplayName(config.provider.displayName || "");
            }
        } catch (err) {
            console.error("Failed to load settings:", err);
            setError("Failed to load settings");
        }
    };

    const loadModels = async () => {
        setLoading(true);
        setError(null);
        try {
            const modelList = await window.jarvis.models.list();
            setModels(modelList);
            if (modelList.length === 0) {
                setError("No models available. Make sure Copilot CLI is configured.");
            }
        } catch (err) {
            console.error("Failed to load models:", err);
            setError("Failed to load available models");
        }
        setLoading(false);
    };

    const selectedModelInfo = models.find((m) => m.id === orchestratorModel);
    const showReasoningEffort = !useProvider && (!orchestratorModel || selectedModelInfo?.supportsReasoningEffort);

    const handleSave = () => {
        // Navigate back immediately, save in background
        onSave();

        const providerConfig = useProvider && providerBaseUrl && providerModel
            ? {
                type: providerType as "azure" | "openai" | "anthropic",
                baseUrl: providerBaseUrl,
                apiKey: providerApiKey || undefined,
                azureApiVersion: providerType === "azure" ? providerAzureApiVersion : undefined,
                model: providerModel,
                displayName: providerDisplayName || undefined,
            }
            : undefined;

        window.jarvis.config.setAndApply({
            browser: { headless, automationMode: automationMode as 'playwright-mcp' | 'playwright-cli' },
            orchestrator: {
                model: useProvider ? providerModel : (orchestratorModel || undefined),
                reasoningEffort: showReasoningEffort ? reasoningEffort : undefined,
            },
            provider: providerConfig as any,
        }).catch((err) => {
            console.error("Failed to save settings:", err);
        });
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-surface">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-2 flex-shrink-0">
                <div className="p-2 bg-lseg-blue/10 rounded-lg">
                    <SettingsIcon size={20} className="text-lseg-blue" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-text">Settings</h2>
                    <p className="text-xs text-text-muted">Configure Promptwright preferences</p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-2xl mx-auto space-y-6">
                    {/* Browser Settings */}
                    <section className="bg-surface-2 rounded-xl p-4 border border-border">
                        <div className="flex items-center gap-2 mb-3">
                            <Monitor size={16} className="text-text-muted" />
                            <h3 className="text-sm font-semibold text-text-muted">Browser</h3>
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={headless}
                                    onChange={(e) => setHeadless(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-10 h-6 bg-surface-2 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-lseg-blue/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lseg-blue"></div>
                            </div>
                            <span className="text-sm text-text-muted group-hover:text-text">
                                Run browser in headless mode
                            </span>
                        </label>
                        <p className="text-xs text-text-muted mt-2 ml-[52px]">
                            When enabled, browser runs invisibly for faster test execution
                        </p>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-text-muted mb-2">
                                Browser Automation Mode
                            </label>
                            <select
                                value={automationMode}
                                onChange={(e) => setAutomationMode(e.target.value)}
                                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all appearance-none cursor-pointer"
                            >
                                <option value="playwright-mcp">Playwright MCP — Rich tool integration via MCP protocol</option>
                                <option value="playwright-cli">Playwright CLI — Token-efficient CLI commands</option>
                            </select>
                            <p className="text-xs text-text-muted mt-1">
                                Controls which web agent the orchestrator prefers for browser tests
                            </p>
                        </div>
                    </section>

                    {/* Custom Provider (BYOK) */}
                    <section className="bg-surface-2 rounded-xl p-4 border border-border">
                        <div className="flex items-center gap-2 mb-3">
                            <Key size={16} className="text-amber-600 dark:text-amber-400" />
                            <h3 className="text-sm font-semibold text-text-muted">Custom Provider (BYOK)</h3>
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={useProvider}
                                    onChange={(e) => setUseProvider(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-10 h-6 bg-surface-2 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-lseg-blue/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            </div>
                            <span className="text-sm text-text-muted group-hover:text-text">
                                Use custom provider instead of Copilot
                            </span>
                        </label>
                        <p className="text-xs text-text-muted mt-2 ml-[52px]">
                            Connect to Azure AI Foundry, OpenAI-compatible, or Anthropic APIs with your own API key
                        </p>

                        {useProvider && (
                            <div className="mt-4 space-y-3 pt-3 border-t border-border">
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1">
                                        Provider Type
                                    </label>
                                    <select
                                        value={providerType}
                                        onChange={(e) => setProviderType(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all appearance-none cursor-pointer"
                                    >
                                        {PROVIDER_TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1">
                                        Base URL
                                    </label>
                                    <input
                                        type="text"
                                        value={providerBaseUrl}
                                        onChange={(e) => setProviderBaseUrl(e.target.value)}
                                        placeholder={providerType === "azure" ? "https://my-resource.openai.azure.com" : "https://api.openai.com/v1"}
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all placeholder:text-text-muted"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1">
                                        API Key
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            value={providerApiKey}
                                            onChange={(e) => setProviderApiKey(e.target.value)}
                                            placeholder="sk-... or leave empty to use PROMPTWRIGHT_PROVIDER_API_KEY env var"
                                            className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all placeholder:text-text-muted"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-muted"
                                        >
                                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-text-muted mt-1">
                                        Or set the PROMPTWRIGHT_PROVIDER_API_KEY environment variable
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1">
                                        Model ID
                                    </label>
                                    <input
                                        type="text"
                                        value={providerModel}
                                        onChange={(e) => setProviderModel(e.target.value)}
                                        placeholder="e.g. gpt-4o, claude-sonnet-4-5-20250514"
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all placeholder:text-text-muted"
                                    />
                                </div>

                                {providerType === "azure" && (
                                    <div>
                                        <label className="block text-sm font-medium text-text-muted mb-1">
                                            Azure API Version
                                        </label>
                                        <input
                                            type="text"
                                            value={providerAzureApiVersion}
                                            onChange={(e) => setProviderAzureApiVersion(e.target.value)}
                                            placeholder="2024-10-21"
                                            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all placeholder:text-text-muted"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-1">
                                        Display Name <span className="text-text-muted">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={providerDisplayName}
                                        onChange={(e) => setProviderDisplayName(e.target.value)}
                                        placeholder="e.g. Azure GPT-4o"
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all placeholder:text-text-muted"
                                    />
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Model Settings */}
                    <section className="bg-surface-2 rounded-xl p-4 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain size={16} className="text-purple-500 dark:text-purple-400" />
                            <h3 className="text-sm font-semibold text-text-muted">AI Model</h3>
                        </div>
                        <p className="text-xs text-text-muted mb-4">
                            {useProvider
                                ? `Using custom provider model: ${providerModel || "(not set)"}`
                                : "Configure the AI model used by the orchestrator"
                            }
                        </p>

                        {error && !useProvider && (
                            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                                {error}
                            </div>
                        )}

                        {useProvider ? (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                                Copilot model selection is disabled when using a custom provider.
                                The model specified in the provider settings above will be used.
                            </div>
                        ) : loading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 size={20} className="animate-spin text-lseg-blue" />
                                <span className="ml-2 text-sm text-text-muted">Loading available models...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-muted mb-2">
                                        Orchestrator Model
                                    </label>
                                    <select
                                        value={orchestratorModel}
                                        onChange={(e) => setOrchestratorModel(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-lseg-blue/50 focus:border-lseg-blue transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="">Use Copilot default</option>
                                        {models.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name || m.id}{m.supportsReasoningEffort ? " ✦" : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-text-muted mt-1">
                                        The orchestrator routes tasks to specialized agents automatically. ✦ = supports thinking
                                    </p>
                                </div>

                                {showReasoningEffort && (
                                    <div>
                                        <label className="block text-sm font-medium text-text-muted mb-2">
                                            Thinking / Reasoning Effort
                                        </label>
                                        <div className="space-y-2">
                                            {REASONING_EFFORT_OPTIONS.map((opt) => (
                                                <label
                                                    key={opt.value}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                        reasoningEffort === opt.value
                                                            ? "border-lseg-blue bg-lseg-blue/5"
                                                            : "border-border bg-surface-2 hover:border-border"
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="reasoningEffort"
                                                        value={opt.value}
                                                        checked={reasoningEffort === opt.value}
                                                        onChange={() => setReasoningEffort(opt.value)}
                                                        className="text-lseg-blue"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium text-text">{opt.label}</span>
                                                        <span className="text-xs text-text-muted ml-2">{opt.description}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                        <p className="text-xs text-text-muted mt-2">
                                            Controls how much thinking the model does before responding
                                        </p>
                                    </div>
                                )}

                                {models.length > 0 && (
                                    <div className="text-xs text-text-muted pt-2 border-t border-border">
                                        {models.length} model{models.length !== 1 ? "s" : ""} available from your Copilot subscription
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-surface-2 flex-shrink-0">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-2 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="px-5 py-2 text-sm font-medium bg-lseg-blue text-accent-fg rounded-lg hover:bg-lseg-blue-dark transition-colors"
                >
                    Save Changes
                </button>
            </div>
        </div>
    );
}
