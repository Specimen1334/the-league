// apps/api/src/modules/auth/forgot-password.service.ts

type ForgotPasswordAuditData = {
  identifier: string;
  ip?: string;
  userAgent?: string;
};

export const forgotPasswordService = {
  /**
   * Placeholder for future password reset email integration.
   * For now we just log the request so we have an audit trail.
   */
  async requestReset(auditData: ForgotPasswordAuditData): Promise<void> {
    // Intentionally no-op for now; in the future this would enqueue an email.
    // Avoid logging extremely sensitive data; keep to high-level metadata.
    const { identifier, ip, userAgent } = auditData;
    console.info("[auth] Password reset requested", { identifier, ip, userAgent });
  }
};