import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Errore imprevisto" };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("Ordynora UI error", error, info);
    }
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="ordynora-error-boundary" role="alert">
        <section>
          <span>Ordynora</span>
          <h1>Qualcosa non ha risposto correttamente.</h1>
          <p>
            La pagina ha incontrato un errore temporaneo. Ricarica l'app oppure torna alla home.
            Se il problema continua, invia questo messaggio al supporto.
          </p>
          <code>{this.state.message}</code>
          <div>
            <button type="button" onClick={() => window.location.reload()}>Ricarica</button>
            <button type="button" onClick={this.reset}>Torna alla home</button>
          </div>
        </section>
      </main>
    );
  }
}
