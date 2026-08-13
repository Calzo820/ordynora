import Navbar from "../components/Navbar";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles";
import "../styles/contact.css";

const SUPPORT_EMAIL = "easy.menu.service@gmail.com";
const SUPPORT_PHONE_DISPLAY = "+39 324 046 7723";
const SUPPORT_PHONE_LINK = "+393240467723";
const WHATSAPP_URL = `https://wa.me/393240467723?text=${encodeURIComponent("Ciao, ho bisogno di supporto per Ordynora.")}`;

export default function Contattaci() {
  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <main className="app-shell contact-shell">
          <section className="contact-hero">
            <span>Supporto Ordynora</span>
            <h1>Contattaci quando il ristorante ha bisogno di una mano.</h1>
            <p>
              Per problemi tecnici, configurazione QR, menu, account o abbonamento riceverai una risposta entro 24 ore.
            </p>
          </section>

          <section className="contact-grid">
            <article className="contact-card contact-card--primary">
              <div className="contact-card__icon">MAIL</div>
              <div>
                <span>Metodo consigliato</span>
                <h2>Email supporto</h2>
                <p>Ideale per spiegare il problema, allegare screenshot o chiedere assistenza su account e configurazione.</p>
              </div>
              <strong>{SUPPORT_EMAIL}</strong>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Supporto Ordynora`}>Scrivi email</a>
            </article>

            <article className="contact-card">
              <div className="contact-card__icon">WA</div>
              <div>
                <span>Servizio e urgenze</span>
                <h2>WhatsApp</h2>
                <p>Usalo se il locale e in servizio e serve una risposta operativa rapida.</p>
              </div>
              <strong>{SUPPORT_PHONE_DISPLAY}</strong>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">Apri WhatsApp</a>
            </article>

            <article className="contact-card">
              <div className="contact-card__icon">TEL</div>
              <div>
                <span>Chiamate</span>
                <h2>Telefono</h2>
                <p>Per onboarding, attivazione ristorante, prova demo o supporto durante la configurazione iniziale.</p>
              </div>
              <strong>{SUPPORT_PHONE_DISPLAY}</strong>
              <a href={`tel:${SUPPORT_PHONE_LINK}`}>Chiama</a>
            </article>
          </section>

          <section className="contact-note">
            <div>
              <span>Risposta entro 24h</span>
              <strong>Quando scrivi, indica nome ristorante, email account e cosa stavi facendo.</strong>
            </div>
            <p>
              Questo ci permette di capire subito se il problema riguarda QR, menu cliente, cassa, cucina, abbonamento o accessi staff.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
