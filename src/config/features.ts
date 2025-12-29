/**
 * Feature Flag System for Agent Command
 *
 * This system allows incremental feature enablement across the codebase.
 * Features are organized by maturity level and can be toggled via environment variables.
 *
 * Usage:
 *   import { features, isEnabled } from './config/features';
 *
 *   if (isEnabled('AGENT_POOL')) {
 *     // Use agent pool functionality
 *   }
 *
 * Environment variable override:
 *   FEATURE_AGENT_POOL=true
 *   FEATURE_PHONE_APPROVALS=false
 */

// ============================================================================
// FEATURE MATURITY LEVELS
// ============================================================================

export type FeatureMaturity = 'stable' | 'beta' | 'experimental' | 'deprecated';

// ============================================================================
// FEATURE DEFINITIONS
// ============================================================================

export interface FeatureDefinition {
  /** Unique feature key */
  key: string;
  /** Human-readable name */
  name: string;
  /** Description of what this feature does */
  description: string;
  /** Maturity level */
  maturity: FeatureMaturity;
  /** Default enabled state */
  defaultEnabled: boolean;
  /** Dependencies on other features (must be enabled first) */
  dependencies?: string[];
  /** Related database migrations */
  migrations?: string[];
  /** Related API endpoints */
  endpoints?: string[];
  /** Environment variable name (auto-generated if not specified) */
  envVar?: string;
}

// ============================================================================
// ALL FEATURES
// ============================================================================

export const FEATURE_DEFINITIONS: Record<string, FeatureDefinition> = {
  // ---------------------------------------------------------------------------
  // CORE PLATFORM ADAPTERS (Stable - V1)
  // ---------------------------------------------------------------------------
  TELEGRAM_ADAPTER: {
    key: 'TELEGRAM_ADAPTER',
    name: 'Telegram Bot Adapter',
    description: 'Telegram bot integration for remote coding commands',
    maturity: 'stable',
    defaultEnabled: true,
    endpoints: ['/webhooks/telegram'],
  },

  SLACK_ADAPTER: {
    key: 'SLACK_ADAPTER',
    name: 'Slack Bot Adapter',
    description: 'Slack bot integration with polling mode',
    maturity: 'stable',
    defaultEnabled: true,
    endpoints: [],
  },

  DISCORD_ADAPTER: {
    key: 'DISCORD_ADAPTER',
    name: 'Discord Bot Adapter',
    description: 'Discord bot integration via discord.js',
    maturity: 'stable',
    defaultEnabled: true,
    endpoints: [],
  },

  GITHUB_ADAPTER: {
    key: 'GITHUB_ADAPTER',
    name: 'GitHub Webhook Adapter',
    description: 'GitHub webhook integration for issue/PR automation',
    maturity: 'stable',
    defaultEnabled: true,
    endpoints: ['/webhooks/github'],
  },

  // ---------------------------------------------------------------------------
  // PHONE VIBECODING V1 (Beta)
  // ---------------------------------------------------------------------------
  PHONE_APPROVALS: {
    key: 'PHONE_APPROVALS',
    name: 'Phone Vibecoding Approvals',
    description: 'Telegram inline buttons for tool execution approval',
    maturity: 'beta',
    defaultEnabled: false,
    dependencies: ['TELEGRAM_ADAPTER'],
    migrations: ['008_add_approvals_table.sql'],
    endpoints: [],
  },

  BLOCKING_APPROVALS: {
    key: 'BLOCKING_APPROVALS',
    name: 'Blocking Approval Mode',
    description: 'Block tool execution until approval received (vs notify-only)',
    maturity: 'beta',
    defaultEnabled: false,
    dependencies: ['PHONE_APPROVALS'],
  },

  // ---------------------------------------------------------------------------
  // MULTI-AGENT POOL (Experimental - PostgreSQL-based, no Redis)
  // ---------------------------------------------------------------------------
  AGENT_POOL: {
    key: 'AGENT_POOL',
    name: 'Multi-Agent Pool Manager',
    description: 'Manage 3-12 parallel agents via PostgreSQL (no Redis required)',
    maturity: 'experimental',
    defaultEnabled: false,
    migrations: ['010_agent_pool.sql'],
    endpoints: ['/api/pool/status', '/api/pool/tasks/:id'],
  },

  REDIS_MESSAGING: {
    key: 'REDIS_MESSAGING',
    name: 'Redis Pub/Sub Messaging (Optional)',
    description: 'Optional: Redis-based pub/sub for 50+ agents. PostgreSQL handles 3-12 agents fine. See FEAT-019 for upgrade path.',
    maturity: 'experimental',
    defaultEnabled: false,
  },

  AGENT_HEARTBEAT: {
    key: 'AGENT_HEARTBEAT',
    name: 'Agent Heartbeat System',
    description: 'Health monitoring via PostgreSQL heartbeat table',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['AGENT_POOL'],
  },

  // ---------------------------------------------------------------------------
  // MULTI-LLM SUPPORT (Experimental)
  // ---------------------------------------------------------------------------
  MULTI_LLM: {
    key: 'MULTI_LLM',
    name: 'Multi-LLM Provider Support',
    description: 'Support for 8+ LLM providers (OpenAI, Anthropic, Gemini, etc.)',
    maturity: 'experimental',
    defaultEnabled: false,
    migrations: ['009_llm_configuration.sql'],
    endpoints: [
      '/api/llm/config',
      '/api/llm/providers',
      '/api/llm/api-keys',
    ],
  },

  LLM_CONFIG_UI: {
    key: 'LLM_CONFIG_UI',
    name: 'LLM Configuration Dashboard',
    description: 'Web UI for managing LLM providers and API keys',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['MULTI_LLM'],
    endpoints: ['/llm-config.html'],
  },

  // ---------------------------------------------------------------------------
  // SWARM COORDINATION (Experimental)
  // ---------------------------------------------------------------------------
  SWARM_COORDINATION: {
    key: 'SWARM_COORDINATION',
    name: 'Swarm Task Coordination',
    description: 'Distribute tasks across agent swarm with role-based assignment',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['AGENT_POOL', 'MULTI_LLM'],
    endpoints: [
      '/api/swarm/execute',
      '/api/swarm/decompose',
      '/api/swarm/status/:swarmId',
      '/api/swarm/result/:swarmId',
      '/api/swarm/stream/:swarmId',
    ],
  },

  TASK_DECOMPOSER: {
    key: 'TASK_DECOMPOSER',
    name: 'AI Task Decomposition',
    description: 'Automatically break complex tasks into subtasks for parallel execution',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['SWARM_COORDINATION'],
  },

  // ---------------------------------------------------------------------------
  // VERIFICATION & RECOVERY (Experimental)
  // ---------------------------------------------------------------------------
  EXTERNAL_VERIFICATION: {
    key: 'EXTERNAL_VERIFICATION',
    name: 'External Verification Engine',
    description: 'Verify agent claims via git and test execution',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['AGENT_POOL'],
  },

  RECOVERY_SYSTEM: {
    key: 'RECOVERY_SYSTEM',
    name: 'Recovery & Escalation',
    description: '3-attempt retry with systematic human escalation',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['AGENT_POOL', 'EXTERNAL_VERIFICATION'],
  },

  // ---------------------------------------------------------------------------
  // DESKTOP APP (Experimental)
  // ---------------------------------------------------------------------------
  ELECTRON_APP: {
    key: 'ELECTRON_APP',
    name: 'Electron Desktop Application',
    description: 'Native desktop app with embedded server',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['MULTI_LLM'],
  },

  // ---------------------------------------------------------------------------
  // COST TRACKING (Experimental)
  // ---------------------------------------------------------------------------
  COST_TRACKING: {
    key: 'COST_TRACKING',
    name: 'Token & Cost Tracking',
    description: 'Track token usage and calculate costs per provider',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['MULTI_LLM'],
  },

  COST_LIMITS: {
    key: 'COST_LIMITS',
    name: 'Cost Limit Enforcement',
    description: 'Enforce per-session and per-day cost limits',
    maturity: 'experimental',
    defaultEnabled: false,
    dependencies: ['COST_TRACKING'],
  },

  // ---------------------------------------------------------------------------
  // DEPRECATED FEATURES
  // ---------------------------------------------------------------------------
  LEGACY_SINGLE_AGENT: {
    key: 'LEGACY_SINGLE_AGENT',
    name: 'Legacy Single-Agent Mode',
    description: 'Original single-agent orchestrator (replaced by pool manager)',
    maturity: 'deprecated',
    defaultEnabled: true, // Still default until agent pool is stable
  },
};

// ============================================================================
// FEATURE FLAG STATE
// ============================================================================

interface FeatureState {
  enabled: boolean;
  overrideSource?: 'env' | 'runtime' | 'default';
}

const featureState: Map<string, FeatureState> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize feature flags from environment variables
 */
export function initializeFeatures(): void {
  for (const [key, definition] of Object.entries(FEATURE_DEFINITIONS)) {
    const envVar = definition.envVar || `FEATURE_${key}`;
    const envValue = process.env[envVar];

    let enabled = definition.defaultEnabled;
    let overrideSource: 'env' | 'runtime' | 'default' = 'default';

    if (envValue !== undefined) {
      enabled = envValue.toLowerCase() === 'true' || envValue === '1';
      overrideSource = 'env';
    }

    featureState.set(key, { enabled, overrideSource });
  }

  // Validate dependencies
  validateDependencies();
}

/**
 * Validate that all feature dependencies are satisfied
 */
function validateDependencies(): void {
  for (const [key, definition] of Object.entries(FEATURE_DEFINITIONS)) {
    if (!definition.dependencies) continue;

    const state = featureState.get(key);
    if (!state?.enabled) continue;

    for (const dep of definition.dependencies) {
      const depState = featureState.get(dep);
      if (!depState?.enabled) {
        console.warn(
          `[FeatureFlags] Warning: Feature '${key}' requires '${dep}' which is disabled. ` +
            `'${key}' will be disabled.`
        );
        featureState.set(key, { enabled: false, overrideSource: 'runtime' });
        break;
      }
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a feature is enabled
 */
export function isEnabled(featureKey: string): boolean {
  const state = featureState.get(featureKey);
  if (!state) {
    console.warn(`[FeatureFlags] Unknown feature: ${featureKey}`);
    return false;
  }
  return state.enabled;
}

/**
 * Enable a feature at runtime
 */
export function enableFeature(featureKey: string): boolean {
  const definition = FEATURE_DEFINITIONS[featureKey];
  if (!definition) {
    console.error(`[FeatureFlags] Unknown feature: ${featureKey}`);
    return false;
  }

  // Check dependencies
  if (definition.dependencies) {
    for (const dep of definition.dependencies) {
      if (!isEnabled(dep)) {
        console.error(
          `[FeatureFlags] Cannot enable '${featureKey}': dependency '${dep}' is disabled`
        );
        return false;
      }
    }
  }

  featureState.set(featureKey, { enabled: true, overrideSource: 'runtime' });
  console.log(`[FeatureFlags] Enabled: ${featureKey}`);
  return true;
}

/**
 * Disable a feature at runtime
 */
export function disableFeature(featureKey: string): boolean {
  const definition = FEATURE_DEFINITIONS[featureKey];
  if (!definition) {
    console.error(`[FeatureFlags] Unknown feature: ${featureKey}`);
    return false;
  }

  // Check for dependents
  for (const [key, def] of Object.entries(FEATURE_DEFINITIONS)) {
    if (def.dependencies?.includes(featureKey) && isEnabled(key)) {
      console.warn(
        `[FeatureFlags] Disabling '${featureKey}' will also disable dependent feature '${key}'`
      );
      disableFeature(key);
    }
  }

  featureState.set(featureKey, { enabled: false, overrideSource: 'runtime' });
  console.log(`[FeatureFlags] Disabled: ${featureKey}`);
  return true;
}

/**
 * Get all features with their current state
 */
export function getAllFeatures(): Array<{
  key: string;
  definition: FeatureDefinition;
  state: FeatureState;
}> {
  return Object.entries(FEATURE_DEFINITIONS).map(([key, definition]) => ({
    key,
    definition,
    state: featureState.get(key) || { enabled: false, overrideSource: 'default' },
  }));
}

/**
 * Get features by maturity level
 */
export function getFeaturesByMaturity(
  maturity: FeatureMaturity
): Array<{ key: string; definition: FeatureDefinition; state: FeatureState }> {
  return getAllFeatures().filter((f) => f.definition.maturity === maturity);
}

/**
 * Get only enabled features
 */
export function getEnabledFeatures(): string[] {
  return getAllFeatures()
    .filter((f) => f.state.enabled)
    .map((f) => f.key);
}

/**
 * Print feature flag summary to console
 */
export function printFeatureSummary(): void {
  console.log('\n=== FEATURE FLAGS ===\n');

  const byMaturity = {
    stable: getFeaturesByMaturity('stable'),
    beta: getFeaturesByMaturity('beta'),
    experimental: getFeaturesByMaturity('experimental'),
    deprecated: getFeaturesByMaturity('deprecated'),
  };

  for (const [maturity, features] of Object.entries(byMaturity)) {
    if (features.length === 0) continue;

    console.log(`[${maturity.toUpperCase()}]`);
    for (const { definition, state } of features) {
      const status = state.enabled ? '✅' : '❌';
      const source = state.overrideSource !== 'default' ? ` (${state.overrideSource})` : '';
      console.log(`  ${status} ${definition.name}${source}`);
    }
    console.log('');
  }
}

// ============================================================================
// FEATURE GUARDS (for use in code)
// ============================================================================

/**
 * Guard decorator for feature-gated functions
 */
export function requireFeature(featureKey: string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      if (!isEnabled(featureKey)) {
        throw new Error(`Feature '${featureKey}' is not enabled`);
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Create a feature-gated wrapper function
 */
export function withFeature<T extends (...args: unknown[]) => unknown>(
  featureKey: string,
  fn: T,
  fallback?: T
): T {
  return ((...args: Parameters<T>) => {
    if (!isEnabled(featureKey)) {
      if (fallback) {
        return fallback(...args);
      }
      console.warn(`[FeatureFlags] Feature '${featureKey}' is disabled, skipping operation`);
      return undefined;
    }
    return fn(...args);
  }) as T;
}

// ============================================================================
// AUTO-INITIALIZE ON IMPORT
// ============================================================================

initializeFeatures();

// Export convenience aliases
export const features = {
  isEnabled,
  enable: enableFeature,
  disable: disableFeature,
  getAll: getAllFeatures,
  getEnabled: getEnabledFeatures,
  print: printFeatureSummary,
  DEFINITIONS: FEATURE_DEFINITIONS,
};

export default features;
