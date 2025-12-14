// apps/api/src/modules/auth/captcha.service.ts

export async function verifyCaptchaToken(
  token: string | undefined | null
): Promise<boolean> {
  // TODO: integrate real ReCAPTCHA using RECAPTCHA_SECRET_KEY
  // For development, we simply treat missing or any token as valid.
  return true;
}
