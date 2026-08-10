import { useState, useEffect } from "react";
import { useTraceStore } from "@/store/traceStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Key } from "lucide-react";

const PROVIDER_MODELS = {
  gemini: "gemini-1.5-flash",
  groq: "openai/gpt-oss-120b",
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
};

const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  off: "Off (no AI)",
};

export default function SettingsModal({ open, onOpenChange }) {
  const aiProvider = useTraceStore((s) => s.aiProvider);
  const aiModel = useTraceStore((s) => s.aiModel);
  const aiApiKey = useTraceStore((s) => s.aiApiKey);
  const setAiSettings = useTraceStore((s) => s.setAiSettings);

  const [provider, setProvider] = useState(aiProvider);
  const [model, setModel] = useState(aiModel);
  const [apiKey, setApiKey] = useState(aiApiKey);

  useEffect(() => {
    if (open) {
      setProvider(aiProvider || "off");
      setModel(aiModel);
      setApiKey(aiApiKey);
    }
  }, [open, aiProvider, aiModel, aiApiKey]);

  const handleProviderChange = (val) => {
    setProvider(val);
    if (val === "off") {
      setModel("");
      return;
    }
    if (!model || model === PROVIDER_MODELS[aiProvider]) {
      setModel(PROVIDER_MODELS[val]);
    }
  };

  const handleSave = () => {
    setAiSettings({
      aiProvider: provider === "off" ? "" : provider,
      aiModel: provider === "off" ? "" : model,
      aiApiKey: provider === "off" ? "" : apiKey,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[hsl(var(--tf-panel))] border-[hsl(var(--tf-border-strong))] text-[hsl(var(--tf-text))] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-[hsl(var(--tf-accent))]" />
            AI Settings
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-[hsl(var(--tf-text-muted))]">
            Configure your preferred LLM provider, model, and API key. Your key
            is stored locally in your browser and never sent to our servers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[hsl(var(--tf-text-dim))] uppercase tracking-wider">
              Provider
            </Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))] text-sm h-9">
                <SelectValue placeholder="AI off — choose a provider" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))] text-[hsl(var(--tf-text))]">
                {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[hsl(var(--tf-text-dim))] uppercase tracking-wider">
              Model
            </Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_MODELS[provider] || "model name"}
              className="bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))] text-sm h-9"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-[12px] text-[hsl(var(--tf-text-dim))] uppercase tracking-wider">
              <Key className="w-3 h-3" />
              API Key
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === "gemini"
                  ? "GEMINI_API_KEY"
                  : provider === "groq"
                    ? "gsk_..."
                    : provider === "openrouter"
                      ? "sk-or-..."
                      : "sk-..."
              }
              className="bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))] text-sm h-9 font-mono"
            />
            <p className="text-[10.5px] text-[hsl(var(--tf-text-dim))]">
              Your key is only sent to{" "}
              {PROVIDER_LABELS[provider]} directly — the backend proxies the
              request without storing it.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--tf-border))]">
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 h-8 rounded-md text-[12.5px] border border-[hsl(var(--tf-border-strong))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 h-8 rounded-md text-[12.5px] font-medium bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] border border-[hsl(var(--tf-accent))]/40 hover:bg-[hsl(var(--tf-accent))]/15 transition-colors"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
