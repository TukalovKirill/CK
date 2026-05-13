import { Link } from "react-router-dom";
import { Heart, Mail } from "lucide-react";

export default function AuthLayout({ mode, children }) {
  const isInvite = mode === "invite";

  return (
    <div className="auth-page">
      <div className="auth-page__left">
        <div className="auth-logo">
          <div className="auth-logo__icon">
            <span className="auth-logo__text">Своя<br/>Компа-<br/>ния</span>
          </div>
        </div>

        <h1 className="auth-welcome">
          Добро<br />
          пожаловать<br />
          в <span className="auth-welcome__accent">свою</span> команду!
        </h1>
        <p className="auth-subtitle">
          Ты важная часть нашей истории.<br />
          Вместе мы создаем атмосферу заботы и вкуса!
        </p>

        <div className="auth-form-card">
          <div className="auth-form-card__header">
            <div className="auth-form-card__icon">
              {isInvite ? <Mail size={24} className="text-red-500" /> : <Heart size={24} className="text-red-500" />}
            </div>
            <div>
              <h2 className="auth-form-card__title">
                {isInvite ? "Принятие приглашения" : "Вход в аккаунт"}
              </h2>
              <p className="auth-form-card__desc">
                {isInvite
                  ? "Менеджер уже пригласил вас в команду. Создайте пароль, чтобы активировать аккаунт и получить доступ к порталу"
                  : "Войдите в портал, чтобы получить доступ к обучению, баллам и магазину"}
              </p>
            </div>
          </div>
          {children}
        </div>

        {isInvite && (
          <div className="auth-bottom-link">
            <div className="auth-bottom-link__card">
              <div>
                <p className="auth-bottom-link__title">Уже есть аккаунт?</p>
                <p className="auth-bottom-link__desc">
                  Войдите в портал под своим логином и паролем.
                </p>
              </div>
              <Link to="/login" className="auth-btn-outline">
                Войти <span className="ml-1">&rarr;</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="auth-page__right">
        <div className="auth-speech-bubble">
          Спасибо,<br />что ты<br />с нами!
        </div>

        <div className="auth-team-photo">
          <div className="auth-team-photo__placeholder">
            Фото команды
          </div>
        </div>

        <div className="auth-how-card">
          <h3 className="auth-how-card__title">Как это работает?</h3>
          <p className="auth-how-card__text">
            Сотрудника регистрирует менеджер, а приглашение приходит на вашу почту.
            Если письма нет — проверьте папку "Спам" или обратитесь к вашему руководителю.
          </p>
        </div>

        <div className="auth-waves">
          <div className="auth-waves__stripe auth-waves__stripe--red" />
          <div className="auth-waves__stripe auth-waves__stripe--yellow" />
          <div className="auth-waves__stripe auth-waves__stripe--blue" />
        </div>
      </div>
    </div>
  );
}
