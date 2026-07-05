import { EventEmitter } from "events";
import type {
  Persona,
  PersonaManagerEvent,
  PersonaManagerEventHandler,
  MCPServerConfig,
} from "./types.js";

/**
 * PersonaManager
 * 
 * Manages persona lifecycle, registration, and MCP server coordination.
 */
export class PersonaManager extends EventEmitter {
  private personas: Map<string, Persona> = new Map();
  private activePersona: Persona | null = null;
  private activeMCPServers: Map<string, any> = new Map();

  /**
   * Register a persona
   */
  register(persona: Persona): void {
    this.personas.set(persona.id, persona);
  }

  /**
   * Unregister a persona
   */
  unregister(personaId: string): void {
    this.personas.delete(personaId);
  }

  /**
   * Get all registered personas
   */
  getAll(): Persona[] {
    return Array.from(this.personas.values()).filter((p) => p.enabled);
  }

  /**
   * Get a persona by ID
   */
  get(personaId: string): Persona | undefined {
    return this.personas.get(personaId);
  }

  /**
   * Get the currently active persona
   */
  getActive(): Persona | null {
    return this.activePersona;
  }

  /**
   * Select and activate a persona
   */
  async select(personaId: string): Promise<void> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    if (!persona.enabled) {
      throw new Error(`Persona is disabled: ${personaId}`);
    }

    const previousPersonaId = this.activePersona?.id;
    this.activePersona = persona;

    // Emit events
    this.emitEvent({ type: "persona_selected", persona });
    if (previousPersonaId) {
      this.emitEvent({
        type: "persona_changed",
        from: previousPersonaId,
        to: personaId,
      });
    }
  }

  /**
   * Get required MCP servers for the active persona
   */
  getRequiredMCPs(): MCPServerConfig[] {
    return this.activePersona?.requiredMCPs || [];
  }

  /**
   * Get the system prompt for the active persona
   */
  getSystemPrompt(): string | null {
    return this.activePersona?.systemPrompt || null;
  }

  /**
   * Get the skill path for the active persona
   */
  getSkillPath(): string | null {
    return this.activePersona?.skillPath || null;
  }

  /**
   * Register an active MCP server instance
   */
  registerMCPServer(mcpId: string, server: any): void {
    this.activeMCPServers.set(mcpId, server);
    this.emitEvent({ type: "mcp_started", mcpId });
  }

  /**
   * Unregister an MCP server instance
   */
  unregisterMCPServer(mcpId: string): void {
    this.activeMCPServers.delete(mcpId);
    this.emitEvent({ type: "mcp_stopped", mcpId });
  }

  /**
   * Get all active MCP servers
   */
  getActiveMCPServers(): Map<string, any> {
    return this.activeMCPServers;
  }

  /**
   * Subscribe to events with typed handler
   */
  onEvent(handler: PersonaManagerEventHandler): () => void {
    this.on("persona-event", handler);
    return () => this.off("persona-event", handler);
  }

  /**
   * Internal: emit a PersonaManagerEvent
   */
  private emitEvent(event: PersonaManagerEvent): void {
    this.emit("persona-event", event);
  }

  /**
   * Clear the active persona (e.g., on session reset)
   */
  clearActive(): void {
    this.activePersona = null;
  }
}
