// apps/api/src/routes/auth.ts
import type { FastifyInstance } from "fastify";
import { authService } from "../modules/auth/auth.service";
import { forgotPasswordService } from "../modules/auth/forgot-password.service";
import { verifyCaptchaToken } from "../modules/auth/captcha.service";
import { sessionsRepo } from "../modules/auth/sessions.repo";
import { toErrorResponse } from "../shared/errors";
import type {
  RegisterBody,
  LoginBody,
  MeResponse,
  ForgotPasswordBody
} from "../modules/auth/auth.schemas";
const SESSION_COOKIE_NAME = "sid";

export function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    try {
      const { body } = request;

      const captchaOk = await verifyCaptchaToken(body.captchaToken);
      if (!captchaOk) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Captcha verification failed"
        });
        return;
      }

      const { user, sessionId } = await authService.register(body);

      reply
        .setCookie(SESSION_COOKIE_NAME, sessionId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production"
        })
        .code(201)
        .send({ user });
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    try {
      const { body } = request;

      const captchaOk = await verifyCaptchaToken(body.captchaToken);
      if (!captchaOk) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Captcha verification failed"
        });
        return;
      }

      const { user, sessionId } = await authService.login(body);

      reply
        .setCookie(SESSION_COOKIE_NAME, sessionId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production"
        })
        .send({ user });
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

app.post<{ Body: ForgotPasswordBody }>("/auth/forgot-password", async (request, reply) => {
    try {
      const { body } = request;

      const identifier = body.identifier?.trim();
      if (!identifier) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Username or email is required"
        });
        return;
      }
      if (identifier.length < 3 || identifier.length > 254) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Username or email must be between 3 and 254 characters"
        });
        return;
      }

      const captchaOk = await verifyCaptchaToken(body.captchaToken);
      if (!captchaOk) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Captcha verification failed"
        });
        return;
      }

      await forgotPasswordService.requestReset({
        identifier,
        ip: request.ip,
        userAgent: request.headers["user-agent"]
      });

      const message =
        "If an account exists for that username or email, you’ll receive reset instructions shortly.";

      reply.send({ ok: true, message });
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });
  
  app.post("/auth/logout", async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId) {
      sessionsRepo.deleteSession(sessionId);
    }
    reply
      .clearCookie(SESSION_COOKIE_NAME, { path: "/" })
      .code(204)
      .send();
  });

  app.get<{ Reply: MeResponse }>("/auth/me", async (request, reply) => {
    if (!request.user) {
      reply.send({ user: null });
      return;
    }
    reply.send({ user: {
      id: request.user.id,
      username: request.user.username,
      displayName: request.user.displayName,
      email: request.user.email,
      role: request.user.role,
      createdAt: request.user.createdAt
    }});
  });
}
