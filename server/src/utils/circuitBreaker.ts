import { logger } from "./logger";

type CBState = "closed" | "open" | "half-open";

interface CBOptions {
  name: string;
  failureThreshold?: number;  // fallas antes de abrir (default 5)
  recoveryTimeMs?: number;    // ms antes de intentar half-open (default 30s)
  successThreshold?: number;  // éxitos en half-open para cerrar (default 2)
}

export class CircuitBreaker {
  private state: CBState = "closed";
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly recovery: number;
  private readonly successThreshold: number;

  constructor(private readonly opts: CBOptions) {
    this.threshold        = opts.failureThreshold  ?? 5;
    this.recovery         = opts.recoveryTimeMs    ?? 30_000;
    this.successThreshold = opts.successThreshold  ?? 2;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.recovery) {
        this.state = "half-open";
        this.successes = 0;
        logger.warn({ circuit: this.opts.name }, "[circuit-breaker] Half-open — probando recuperación");
      } else {
        throw new Error(`Circuit breaker [${this.opts.name}] abierto — servicio no disponible`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = "closed";
        logger.info({ circuit: this.opts.name }, "[circuit-breaker] Cerrado — servicio recuperado");
      }
    }
  }

  private onFailure(err: unknown): void {
    this.failures++;
    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
      logger.error({ circuit: this.opts.name, err }, "[circuit-breaker] Abierto — demasiados fallos");
    }
  }

  getState(): CBState { return this.state; }
  getName(): string   { return this.opts.name; }
}

// Instancias compartidas por servicio
export const stripeCircuit   = new CircuitBreaker({ name: "stripe",   failureThreshold: 5, recoveryTimeMs: 60_000 });
export const whatsappCircuit = new CircuitBreaker({ name: "whatsapp", failureThreshold: 3, recoveryTimeMs: 30_000 });
export const emailCircuit    = new CircuitBreaker({ name: "email",    failureThreshold: 5, recoveryTimeMs: 30_000 });
