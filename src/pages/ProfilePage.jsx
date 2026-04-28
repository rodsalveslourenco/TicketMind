import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

function ProfilePage() {
  const { user } = useAuth();
  const { pushToast, updateOwnProfile, users } = useAppData();
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const currentUser = useMemo(
    () => users.find((candidate) => candidate.id === user?.id) || user,
    [user, users],
  );

  const handleAvatarChange = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast("Arquivo invalido", "Selecione uma imagem para a foto do perfil.", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast("Arquivo muito grande", "Use uma imagem com ate 2 MB.", "warning");
      return;
    }

    try {
      setSaving(true);
      const avatar = await readImageFileAsDataUrl(file);
      updateOwnProfile({ avatar });
      pushToast("Foto atualizada", currentUser?.name || "Perfil");
    } catch (error) {
      pushToast("Falha ao carregar foto", error.message, "warning");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = () => {
    updateOwnProfile({ avatar: "" });
    pushToast("Foto removida", currentUser?.name || "Perfil");
  };

  return (
    <div className="users-page profile-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Perfil</span>
          <h2>Meu perfil</h2>
        </div>
        <p className="module-caption">Aqui voce pode atualizar apenas a sua foto. Permissoes e cadastros permanecem bloqueados.</p>
      </section>

      <section className="board-card profile-card">
        <div className="profile-avatar-panel">
          <button
            className="profile-avatar profile-avatar-large interactive-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {currentUser?.avatar ? (
              <img alt={currentUser.name} className="profile-avatar-image" src={currentUser.avatar} />
            ) : (
              <span>{getInitials(currentUser?.name)}</span>
            )}
          </button>
          <div className="profile-avatar-copy">
            <strong>{currentUser?.name}</strong>
            <span>{currentUser?.email}</span>
            <span>{currentUser?.role} | {currentUser?.team}</span>
          </div>
        </div>

        <input
          accept="image/*"
          className="profile-file-input"
          onChange={handleAvatarChange}
          ref={fileInputRef}
          type="file"
        />

        <div className="ticket-create-actions">
          <button className="primary-button interactive-button" disabled={saving} onClick={() => fileInputRef.current?.click()} type="button">
            {saving ? "Enviando..." : "Alterar foto"}
          </button>
          <button className="ghost-button interactive-button" disabled={saving || !currentUser?.avatar} onClick={handleRemoveAvatar} type="button">
            Remover foto
          </button>
        </div>

        <div className="glpi-form-grid profile-summary-grid">
          <label className="field-block">
            <span>Nome</span>
            <input disabled value={currentUser?.name || ""} />
          </label>
          <label className="field-block">
            <span>Email</span>
            <input disabled value={currentUser?.email || ""} />
          </label>
          <label className="field-block">
            <span>Perfil</span>
            <input disabled value={currentUser?.role || ""} />
          </label>
          <label className="field-block">
            <span>Equipe</span>
            <input disabled value={currentUser?.team || ""} />
          </label>
        </div>
      </section>
    </div>
  );
}

export default ProfilePage;
