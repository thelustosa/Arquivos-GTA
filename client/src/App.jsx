import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// Global Fetch Interceptor for Security Overhaul
const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  if(config === undefined) {
    config = {};
  }
  
  // 1. Sempre enviar HttpOnly cookies
  config.credentials = 'include';
  
  // 2. Anti-CSRF e Anti-Replay para mutações (POST, PUT, DELETE)
  if (config.method && config.method.toUpperCase() !== 'GET') {
    config.headers = config.headers || {};
    
    // Adiciona o Token CSRF (se já foi obtido via API de inicialização)
    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    
    // Adiciona Nonce único para Anti-Replay
    const nonce = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    config.headers['X-Nonce'] = nonce;
  }
  
  return originalFetch(resource, config);
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return '';

  const now = new Date();
  const postDate = new Date(dateString);
  const diffInSeconds = Math.floor((now - postDate) / 1000);

  if (diffInSeconds < 60) return 'agora';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}min`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}m`;

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}a`;
};

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `http://${window.location.hostname}:5001${url}`;
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  return (
    <div className="report-modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="report-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="report-modal-header">
          <h2 style={{ fontSize: '18px' }}>{title}</h2>
          <button className="report-close-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <div className="report-modal-content" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <p style={{ margin: 0, fontSize: '16px', color: '#0f1419' }}>{message}</p>
        </div>
        <div className="report-modal-footer" style={{ display: 'flex', gap: '12px', padding: '16px 20px' }}>
          <button className="report-motive-tag" onClick={onClose} style={{ flex: 1, margin: 0, justifyContent: 'center' }}>
            Cancelar
          </button>
          <button
            className="report-submit-btn ready"
            onClick={onConfirm}
            style={{ flex: 1, margin: 0, background: '#f4212e', color: 'white', border: 'none' }}
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
};

const UserLikesModal = ({ isOpen, onClose, postId, title }) => {
  const [users, setUsers] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (isOpen && postId) {
      const fetchLikers = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`http://${window.location.hostname}:5001/api/likes/${postId}`);
          if (res.ok) {
            const data = await res.json();
            setUsers(data.likers);
          }
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
      };
      fetchLikers();
    }
  }, [isOpen, postId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content users-list-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-modal" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <div className="modal-body-scrollable">
          {isLoading ? (
            <div className="loading-state">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="loading-state">Ninguém curtiu ainda.</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="user-list-item">
                <div className="user-list-item-left" onClick={() => {
                  window.history.pushState({}, '', `/${user.username.replace(/^@/, '')}`);
                  window.dispatchEvent(new Event('popstate'));
                  onClose();
                }} style={{ cursor: 'pointer' }}>
                  <div
                    className="user-list-avatar"
                    style={{
                      backgroundImage: user.profile_url ? `url(${getImageUrl(user.profile_url)})` : 'none',
                      backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: user.profile_url ? 'transparent' : '#e1e8ed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {!user.profile_url && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                    )}
                  </div>
                  <div className="user-list-info">
                    <span className="user-list-name">{user.name}</span>
                    <span className="user-list-username">@{user.username.replace(/^@/, '')}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const ReportModal = ({ post, onClose, onReport, selectedMotive, setSelectedMotive }) => {
  const motives = [
    'Assédio', 'Fraude ou golpe', 'Spam', 'Desinformação', 'Discurso de ódio',
    'Ameaças ou violência', 'Auto-mutilação', 'Conteúdo gráfico',
    'Organizações perigosas ou extremistas', 'Conteúdo sexual', 'Conta falsa',
    'Exploração infantil', 'Produtos e serviços restritos'
  ];

  if (!post) return null;

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>
        <div className="report-modal-header">
          <h2>Denunciar esta publicação</h2>
          <button className="report-close-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <div className="report-modal-content">
          <p>Selecione o motivo da denúncia</p>
          <div className="report-motives-grid">
            {motives.map(m => (
              <span
                key={m}
                className={`report-motive-tag ${selectedMotive === m ? 'selected' : ''}`}
                onClick={() => setSelectedMotive(m)}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="report-modal-footer">
          <button
            className={`report-submit-btn ${selectedMotive ? 'ready' : ''}`}
            disabled={!selectedMotive}
            onClick={onReport}
          >
            Avançar
          </button>
        </div>
      </div>
    </div>
  );
};

const Navbar = ({ userData, activePage }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/api/notifications/unread/${userData?.id}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (e) { console.error(e); }
  };

  React.useEffect(() => {
    if (userData?.id) {
      fetchUnread();
      const interval = setInterval(fetchUnread, 1000);
      return () => clearInterval(interval);
    }
  }, [userData?.id]);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <nav className="feed-navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <div className="brand-logo-container nav-brand" onClick={() => navigateTo('/feed')} style={{ cursor: 'pointer' }}>
            <div className="logo-main" style={{ marginTop: 0 }}>
              <span className="logo-bold" style={{ fontSize: '20px' }}>ARQUIVOS</span>
              <span className="logo-thin" style={{ height: '24px', padding: '0 8px 6px', fontSize: '18px' }}>gta</span>
            </div>
          </div>
          <div className="navbar-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" placeholder="Pesquisar" />
          </div>
        </div>
        <div className="navbar-right">
          <div className={`nav-icon ${activePage === 'home' ? 'active' : ''}`} onClick={() => navigateTo('/feed')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-house"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            <span>Início</span>
          </div>
          <div className={`nav-icon ${activePage === 'messages' ? 'active' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span>Mensagens</span>
          </div>
          <div className={`nav-icon ${activePage === 'notifications' ? 'active' : ''}`} onClick={() => navigateTo('/notificacoes')} style={{ position: 'relative' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bell"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            {unreadCount > 0 && (
              <span className={`notification-badge ${unreadCount > 0 ? 'pulse' : ''}`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <span>Notificações</span>
          </div>
          <div className={`nav-icon ${activePage === 'profile' ? 'active' : ''}`} onClick={() => navigateTo(`/${userData?.username?.replace(/^@/, '') || 'perfil'}`)}>
            <div
              className="profile-pic-small"
              style={{
                width: '24px', height: '24px',
                backgroundImage: userData?.profile_url ? `url(${getImageUrl(userData.profile_url)})` : 'none',
                backgroundSize: 'cover', backgroundPosition: 'center',
                backgroundColor: userData?.profile_url ? 'transparent' : '#e1e8ed',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {!userData?.profile_url && (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
              )}
            </div>
            <span>Perfil</span>
          </div>
        </div>
      </div>
    </nav>
  );
};

const PostEditorModal = ({ isOpen, onClose, initialPost, userData, onPostSuccess, showToast }) => {
  const [postContent, setPostContent] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mediaInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialPost) {
        setPostContent(initialPost.content || '');
        if (initialPost.media && initialPost.media.length > 0) {
          const m = initialPost.media.map(orig => ({
            url: getImageUrl(orig.url),
            originalUrl: orig.url,
            type: orig.type,
            isExisting: true,
            id: Math.random().toString(36).substr(2, 9)
          }));
          setMediaItems(m);
        } else {
          setMediaItems([]);
        }
      } else {
        setPostContent('');
        setMediaItems([]);
      }
      setIsSubmitting(false);
    }
  }, [isOpen, initialPost]);

  const handleMediaChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (mediaItems.length + files.length > 10) {
      showToast('Você pode subir no máximo 10 mídias por post.', 'error');
      return;
    }
    const validFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const newItems = validFiles.map(f => ({
      url: URL.createObjectURL(f),
      type: f.type,
      file: f,
      isExisting: false,
      id: Math.random().toString(36).substr(2, 9)
    }));
    setMediaItems(prev => [...prev, ...newItems]);
  };

  const removeMediaItem = (i) => {
    setMediaItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const handlePublishPost = async () => {
    if (!postContent.trim() && mediaItems.length === 0) {
      showToast('A publicação não pode estar vazia.', 'error');
      return;
    }
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('userId', userData.id);
    if (postContent.trim()) formData.append('content', postContent);

    const retainedMedia = [];
    mediaItems.forEach(m => {
      if (m.isExisting) {
        retainedMedia.push(m.originalUrl);
      } else if (m.file) {
        formData.append('postMedia', m.file);
      }
    });

    if (initialPost) {
      formData.append('retainedMedia', JSON.stringify(retainedMedia));
    }

    try {
      const url = initialPost
        ? `http://${window.location.hostname}:5001/api/posts/${initialPost.id}`
        : `http://${window.location.hostname}:5001/api/posts`;
      const method = initialPost ? 'PUT' : 'POST';

      const response = await fetch(url, { method, body: formData });
      const data = await response.json();
      if (response.ok) {
        showToast(initialPost ? 'Publicação atualizada com sucesso!' : 'Publicação enviada com sucesso!', 'success');
        onPostSuccess();
        onClose();
      } else {
        showToast(data.message || 'Erro ao processar publicação.', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Erro de rede ao salvar.', 'error');
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="create-post-modal-overlay" onClick={(e) => {
      if (e.target.className === 'create-post-modal-overlay') onClose();
    }}>
      <div className="create-post-modal">
        <div className="create-post-header" style={{ justifyContent: 'center' }}>
          <span className="create-post-header-title">{initialPost ? 'Editar publicação' : 'Criar publicação'}</span>
        </div>

        <div className="create-post-body">
          <div className="create-post-input-section">
            <div
              className="profile-pic-small"
              style={{
                width: '40px', height: '40px', flexShrink: 0,
                backgroundImage: userData?.profile_url ? `url(${getImageUrl(userData.profile_url)})` : 'none',
                backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: userData?.profile_url ? 'transparent' : '#e1e8ed',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {!userData?.profile_url && (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
              )}
            </div>
            <div className="create-post-textarea-container">
              <textarea
                className="create-post-textarea"
                placeholder={initialPost ? "Edite seu texto..." : "Vamos publicar?"}
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {mediaItems.length > 0 && (
            <div className="create-post-multi-preview">
              {mediaItems.map((media, index) => (
                <div key={media.id} className="create-post-media-preview-item">
                  <button className="create-post-remove-media" onClick={() => removeMediaItem(index)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                  {media.type.startsWith('video') ? (
                    <video src={media.url} muted />
                  ) : (
                    <img src={media.url} alt="Preview" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="create-post-footer">
          <div className="create-post-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              ref={mediaInputRef}
              onChange={handleMediaChange}
              multiple
            />
            <button className="create-post-add-media-btn" onClick={() => mediaInputRef.current.click()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
              ADICIONAR MÍDIA
            </button>

            <button
              className="create-post-submit-btn"
              onClick={handlePublishPost}
              disabled={isSubmitting || (!postContent.trim() && mediaItems.length === 0)}
            >
              {isSubmitting ? 'Salvando...' : initialPost ? 'Salvar' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Home = ({ userData, showToast }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxPost, setLightboxPost] = useState(null);
  const [lightboxMediaIndex, setLightboxMediaIndex] = useState(0);
  // { [postId]: { count: number, liked: boolean } }
  const [likesState, setLikesState] = useState({});
  const [openMenuId, setOpenMenuId] = useState(null);
  const [reportingPost, setReportingPost] = useState(null);
  const [selectedMotive, setSelectedMotive] = useState('');
  const [postToDelete, setPostToDelete] = useState(null);
  const [showLikesPostId, setShowLikesPostId] = useState(null);



  const handleDeletePost = (e, postId) => {
    if (e) e.stopPropagation();
    setPostToDelete(postId);
    setOpenMenuId(null);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete) return;
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/api/posts/${postToDelete}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id })
      });
      if (res.ok) {
        showToast('Publicação excluída com sucesso.', 'success');
        fetchPosts();
      } else {
        const d = await res.json();
        showToast(d.message || 'Erro ao excluir.', 'error');
      }
    } catch (e) { console.error(e); }
    setPostToDelete(null);
  };

  const handleReport = async () => {
    if (!selectedMotive || !reportingPost) return;
    try {
      await fetch(`http://${window.location.hostname}:5001/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: reportingPost.id,
          userId: userData.id,
          reason: selectedMotive
        })
      });
      showToast('Denúncia enviada para análise. Obrigado!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao enviar denúncia.', 'error');
    }
    setReportingPost(null);
    setSelectedMotive('');
  };


  const fetchPosts = async () => {
    try {
      const response = await fetch(`http://${window.location.hostname}:5001/api/posts`);
      if (response.ok) {
        const data = await response.json();
        setPosts(data);
        // Fetch like status for each post in parallel
        if (userData?.id && data.length > 0) {
          const likeResults = await Promise.all(
            data.map(p =>
              fetch(`http://${window.location.hostname}:5001/api/likes/${p.id}?userId=${userData.id}`)
                .then(r => r.ok ? r.json() : { count: 0, userLiked: false })
                .then(d => ({ postId: p.id, count: d.count, liked: d.userLiked }))
            )
          );
          const map = {};
          likeResults.forEach(({ postId, count, liked }) => { map[postId] = { count, liked }; });
          setLikesState(map);
        }
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLike = async (postId) => {
    if (!userData?.id) return;
    // Optimistic update
    setLikesState(prev => {
      const cur = prev[postId] || { count: 0, liked: false };
      return { ...prev, [postId]: { count: cur.liked ? cur.count - 1 : cur.count + 1, liked: !cur.liked } };
    });
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/api/likes/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, userId: userData.id })
      });
      if (res.ok) {
        const data = await res.json();
        setLikesState(prev => ({ ...prev, [postId]: { count: data.count, liked: data.liked } }));
      }
    } catch (e) {
      console.error('Erro ao curtir:', e);
      // Revert optimistic update on error
      setLikesState(prev => {
        const cur = prev[postId] || { count: 0, liked: false };
        return { ...prev, [postId]: { count: cur.liked ? cur.count - 1 : cur.count + 1, liked: !cur.liked } };
      });
    }
  };

  React.useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 1000);
    return () => clearInterval(interval);
  }, [userData?.id]);

  React.useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const renderMediaGrid = (post) => {
    const media = post.media;
    if (!media || media.length === 0) return null;

    const openLightbox = (idx) => { setLightboxPost(post); setLightboxMediaIndex(idx); };

    const renderItem = (item, idx, className = '') => {
      if (item.type === 'video') {
        return (
          <div key={idx} className={`media-grid-item ${className}`}>
            <video src={getImageUrl(item.url)} controls />
          </div>
        );
      }
      return (
        <div key={idx} className={`media-grid-item ${className}`} onClick={() => openLightbox(idx)}>
          <img src={getImageUrl(item.url)} alt="" />
        </div>
      );
    };

    // 1 photo: full width
    if (media.length === 1) {
      return <div className="media-grid media-grid-1">{renderItem(media[0], 0)}</div>;
    }

    // 2 photos: side by side
    if (media.length === 2) {
      return (
        <div className="media-grid media-grid-2">
          {renderItem(media[0], 0)}
          {renderItem(media[1], 1)}
        </div>
      );
    }

    // 3 photos: 1 top full, 2 bottom
    if (media.length === 3) {
      return (
        <div className="media-grid media-grid-3">
          {renderItem(media[0], 0, 'media-grid-main')}
          <div className="media-grid-bottom">
            {renderItem(media[1], 1)}
            {renderItem(media[2], 2)}
          </div>
        </div>
      );
    }

    // 4-5 photos: 1 large left, rest stacked right
    if (media.length <= 5) {
      const visibleRight = media.slice(1, 4); // Show max 3 on right
      const remaining = media.length - 4;
      return (
        <div className="media-grid media-grid-4">
          {renderItem(media[0], 0, 'media-grid-left')}
          <div className="media-grid-right-stack">
            {visibleRight.map((item, i) => {
              const idx = i + 1;
              const isLast = idx === 3 && remaining > 0;
              return (
                <div key={idx} className="media-grid-item" onClick={() => openLightbox(idx)}>
                  <img src={getImageUrl(item.url)} alt="" />
                  {isLast && (
                    <div className="media-grid-overlay">
                      <span>+{remaining}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 6+ photos: 1 large top, 3 bottom, last with +N
    const remaining = media.length - 4;
    return (
      <div className="media-grid media-grid-6plus">
        {renderItem(media[0], 0, 'media-grid-main')}
        <div className="media-grid-bottom">
          {renderItem(media[1], 1)}
          {renderItem(media[2], 2)}
          <div className="media-grid-item" onClick={() => openLightbox(3)}>
            <img src={getImageUrl(media[3].url)} alt="" />
            <div className="media-grid-overlay">
              <span>+{remaining}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };



  return (
    <div className="feed-layout-container">
      <Navbar userData={userData} activePage="home" />

      <div className="feed-main-container">
        <aside className="feed-left-sidebar">
          <div className="profile-card" onClick={() => {
            window.history.pushState({}, '', `/${userData?.username?.replace(/^@/, '') || 'perfil'}`);
            window.dispatchEvent(new Event('popstate'));
          }} style={{ cursor: 'pointer' }}>
            <div
              className="profile-cover"
              style={{
                backgroundImage: userData?.cover_url ? `url(${getImageUrl(userData.cover_url)})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            ></div>
            <div
              className="profile-pic"
              style={{
                backgroundImage: userData?.profile_url ? `url(${getImageUrl(userData.profile_url)})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: userData?.profile_url ? 'transparent' : '#e1e8ed'
              }}
            >
              {!userData?.profile_url && (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
              )}
            </div>
            <div className="profile-info">
              <h2>{userData?.name || 'Usuário'}</h2>
              <p className="bio" style={{ color: 'rgba(0,0,0,0.6)', marginTop: '-5px', fontSize: '0.85rem' }}>
                @{userData?.username?.replace(/^@/, '') || 'user'}
              </p>
            </div>
          </div>
        </aside>

        <main className="feed-content">
          <div className="create-post-placeholder" onClick={() => { setEditingPost(null); setEditorOpen(true); }}>
            <div
              className="profile-pic-small"
              style={{
                backgroundImage: userData?.profile_url ? `url(${getImageUrl(userData.profile_url)})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: userData?.profile_url ? 'transparent' : '#e1e8ed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {!userData?.profile_url && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
              )}
            </div>
            <input
              type="text"
              placeholder="Começar publicação"
              onClick={() => { setEditingPost(null); setEditorOpen(true); }}
              readOnly
              style={{ cursor: 'pointer' }}
            />
          </div>

          <div className="posts-container">
            {isLoading ? (
              <div className="feed-placeholder">Carregando publicações...</div>
            ) : posts.length === 0 ? (
              <div className="feed-placeholder">Nenhuma publicação encontrada. Seja o primeiro a postar!</div>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="post-card">
                  <div className="post-header">
                    <div
                      className="profile-pic-small clickable-profile"
                      onClick={() => {
                        window.history.pushState({}, '', `/${post.username.replace(/^@/, '')}`);
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      style={{
                        width: '44px', height: '44px',
                        backgroundImage: post.profile_url ? `url(${getImageUrl(post.profile_url)})` : 'none',
                        backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: post.profile_url ? 'transparent' : '#e1e8ed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      {!post.profile_url && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                      )}
                    </div>
                    <div className="post-author-info">
                      <div
                        className="post-author-name clickable-profile"
                        onClick={() => {
                          window.history.pushState({}, '', `/${post.username.replace(/^@/, '')}`);
                          window.dispatchEvent(new Event('popstate'));
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="author-name">{post.name}</span>
                        <span className="post-dot">·</span>
                        <span className="post-time">{formatRelativeTime(post.created_at)}</span>
                      </div>
                      <div
                        className="post-author-username clickable-profile"
                        onClick={() => {
                          window.history.pushState({}, '', `/${post.username.replace(/^@/, '')}`);
                          window.dispatchEvent(new Event('popstate'));
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="author-username">@{post.username.replace(/^@/, '')}</span>
                      </div>
                    </div>

                    <button
                      className="post-options-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === post.id ? null : post.id);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                    </button>

                    {openMenuId === post.id && (
                      <div className="post-options-menu">
                        {userData?.id === post.user_id ? (
                          <>
                            <button className="post-options-item" onClick={() => { setEditingPost(post); setEditorOpen(true); setOpenMenuId(null); }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                              <span>Editar</span>
                            </button>
                            <button className="post-options-item delete" onClick={(e) => handleDeletePost(e, post.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                              <span>Excluir</span>
                            </button>
                          </>
                        ) : (
                          <button className="post-options-item" onClick={() => { setReportingPost(post); setOpenMenuId(null); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></svg>
                            <span>Denunciar</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="post-content">
                    {post.content && <p className="post-text">{post.content}</p>}

                    {renderMediaGrid(post)}
                  </div>

                  <div className="post-stats" onClick={() => setShowLikesPostId(post.id)} style={{ cursor: 'pointer' }}>
                    {(() => {
                      const likeData = likesState[post.id] || { count: 0, liked: false };
                      return (
                        <>
                          <span className="stat-item">
                            <strong>{likeData.count}</strong> {likeData.count === 1 ? 'Curtida' : 'Curtidas'}
                          </span>
                          <span className="stat-item">
                            <strong>0</strong> Comentários
                          </span>
                        </>
                      );
                    })()}
                  </div>

                  <div className="post-footer-actions">
                    {(() => {
                      const likeData = likesState[post.id] || { count: 0, liked: false };
                      return (
                        <div
                          className={`post-action like-action ${likeData.liked ? 'liked' : ''}`}
                          onClick={() => handleToggleLike(post.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={likeData.liked ? "#f91880" : "none"} stroke={likeData.liked ? "#f91880" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.505 4.046 3 5.5L12 21Z" /></svg>
                          <span style={{ color: likeData.liked ? "#f91880" : undefined }}>Curtir</span>
                        </div>
                      );
                    })()}
                    <div className="post-action">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      <span>Comentar</span>
                    </div>
                    <div className="post-action">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
                      <span>Repostar</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>



      {/* Post Editor Modal Integration */}
      <PostEditorModal
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingPost(null); }}
        initialPost={editingPost}
        userData={userData}
        showToast={showToast}
        onPostSuccess={() => { fetchPosts(); }}
      />

      {/* LinkedIn-style Lightbox */}
      {lightboxPost && (
        <div className="lightbox-overlay" onClick={(e) => { if (e.target.className === 'lightbox-overlay') setLightboxPost(null); }}>
          <div className="lightbox-container">
            <div className="lightbox-media-side">
              {lightboxPost.media[lightboxMediaIndex]?.type === 'video' ? (
                <video src={getImageUrl(lightboxPost.media[lightboxMediaIndex].url)} controls autoPlay className="lightbox-media" />
              ) : (
                <img src={getImageUrl(lightboxPost.media[lightboxMediaIndex].url)} alt="" className="lightbox-media" />
              )}

              {lightboxPost.media.length > 1 && (
                <>
                  {lightboxMediaIndex > 0 && (
                    <button className="lightbox-nav lightbox-prev" onClick={() => setLightboxMediaIndex(i => i - 1)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                  )}
                  {lightboxMediaIndex < lightboxPost.media.length - 1 && (
                    <button className="lightbox-nav lightbox-next" onClick={() => setLightboxMediaIndex(i => i + 1)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  )}
                  <div className="lightbox-counter">{lightboxMediaIndex + 1} / {lightboxPost.media.length}</div>
                </>
              )}
            </div>

            <div className="lightbox-details-side">
              <button className="lightbox-close" onClick={() => setLightboxPost(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>

              <div className="lightbox-post-header">
                <div
                  className="profile-pic-small"
                  style={{
                    width: '48px', height: '48px', flexShrink: 0,
                    backgroundImage: lightboxPost.profile_url ? `url(${getImageUrl(lightboxPost.profile_url)})` : 'none',
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    backgroundColor: lightboxPost.profile_url ? 'transparent' : '#e1e8ed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {!lightboxPost.profile_url && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                  )}
                </div>
                <div className="lightbox-author-info">
                  <span className="lightbox-author-name">{lightboxPost.name}</span>
                  <span className="lightbox-author-username">@{lightboxPost.username?.replace(/^@/, '')}</span>
                  <span className="lightbox-post-time">{formatRelativeTime(lightboxPost.created_at)}</span>
                </div>
              </div>

              {lightboxPost.content && (
                <p className="lightbox-post-text">{lightboxPost.content}</p>
              )}

              <div className="post-stats" onClick={() => setShowLikesPostId(lightboxPost.id)} style={{ borderBottom: '1px solid #eff3f4', margin: '0 16px 8px', padding: '8px 0', cursor: 'pointer' }}>
                {(() => {
                  const likeData = likesState[lightboxPost.id] || { count: 0, liked: false };
                  return (
                    <>
                      <span className="stat-item">
                        <strong>{likeData.count}</strong> {likeData.count === 1 ? 'Curtida' : 'Curtidas'}
                      </span>
                      <span className="stat-item">
                        <strong>0</strong> Comentários
                      </span>
                    </>
                  );
                })()}
              </div>

              <div className="lightbox-actions">
                {(() => {
                  const likeData = likesState[lightboxPost.id] || { count: 0, liked: false };
                  return (
                    <div
                      className={`lightbox-action-btn ${likeData.liked ? 'liked' : ''}`}
                      onClick={() => handleToggleLike(lightboxPost.id)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={likeData.liked ? "#f91880" : "none"} stroke={likeData.liked ? "#f91880" : "currentColor"} strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.505 4.046 3 5.5L12 21Z" /></svg>
                      <span style={{ color: likeData.liked ? "#f91880" : undefined }}>Curtir</span>
                    </div>
                  );
                })()}
                <div className="lightbox-action-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <span>Comentar</span>
                </div>
                <div className="lightbox-action-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
                  <span>Repostar</span>
                </div>
              </div>

              <div className="lightbox-comments-area">
                <div className="lightbox-comment-input">
                  <div
                    className="profile-pic-small"
                    style={{
                      width: '36px', height: '36px', flexShrink: 0,
                      backgroundImage: userData?.profile_url ? `url(${getImageUrl(userData.profile_url)})` : 'none',
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      backgroundColor: userData?.profile_url ? 'transparent' : '#e1e8ed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {!userData?.profile_url && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                    )}
                  </div>
                  <input type="text" placeholder="Adicionar comentário..." className="lightbox-comment-field" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {reportingPost && (
        <ReportModal
          post={reportingPost}
          onClose={() => setReportingPost(null)}
          onReport={handleReport}
          selectedMotive={selectedMotive}
          setSelectedMotive={setSelectedMotive}
        />
      )}

      <ConfirmModal
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={confirmDeletePost}
        title="Excluir publicação"
        message="Tem certeza que deseja excluir esta publicação? Esta ação não pode ser desfeita."
      />

      <UserLikesModal
        isOpen={!!showLikesPostId}
        onClose={() => setShowLikesPostId(null)}
        postId={showLikesPostId}
        title="Curtidas"
      />
    </div>
  );
}

const Profile = ({ targetUsername, loggedInUser, setUserData, showToast }) => {
  const [profileData, setProfileData] = useState(null);
  const [userNotFound, setUserNotFound] = useState(false);
  const isOwnProfile = loggedInUser?.id === profileData?.id;
  const profileInputRef = React.useRef(null);
  const coverInputRef = React.useRef(null);
  const [activeTab, setActiveTab] = useState('posts');
  const [userPosts, setUserPosts] = useState([]);
  const [isLoadingUserPosts, setIsLoadingUserPosts] = useState(true);
  const [likesState, setLikesState] = useState({});
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollower, setIsFollower] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [followCounts, setFollowCounts] = useState({ following: 0, followers: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalUsers, setModalUsers] = useState([]);
  const [myFollowingIds, setMyFollowingIds] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isListLoading, setIsListLoading] = useState(false);
  const [activeUserMenuId, setActiveUserMenuId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [reportingPost, setReportingPost] = useState(null);
  const [selectedMotive, setSelectedMotive] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postToDelete, setPostToDelete] = useState(null);
  const [showLikesPostId, setShowLikesPostId] = useState(null);
  React.useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleDeletePost = (e, postId) => {
    if (e) e.stopPropagation();
    setPostToDelete(postId);
    setOpenMenuId(null);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete) return;
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/api/posts/${postToDelete}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: loggedInUser.id })
      });
      if (res.ok) {
        showToast('Publicação excluída com sucesso.', 'success');
        fetchUserPosts();
      } else {
        const d = await res.json();
        showToast(d.message || 'Erro ao excluir.', 'error');
      }
    } catch (e) { console.error(e); }
    setPostToDelete(null);
  };

  const handleReport = async () => {
    if (!selectedMotive || !reportingPost) return;
    try {
      await fetch(`http://${window.location.hostname}:5001/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: reportingPost.id,
          userId: loggedInUser.id,
          reason: selectedMotive
        })
      });
      showToast('Denúncia enviada para análise. Obrigado!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao enviar denúncia.', 'error');
    }
    setReportingPost(null);
    setSelectedMotive('');
  };

  const fetchFollowList = async (type) => {
    if (!profileData?.id) return;
    setModalTitle(type === 'following' ? 'Seguindo' : 'Seguidores');
    setIsModalOpen(true);
    setIsListLoading(true);
    try {
      if (loggedInUser?.id) {
        const myFollowRes = await fetch(`http://${window.location.hostname}:5001/api/following/${loggedInUser.id}`);
        if (myFollowRes.ok) {
          const myFollowData = await myFollowRes.json();
          setMyFollowingIds(myFollowData.map(u => u.id));
        }
      }
      const res = await fetch(`http://${window.location.hostname}:5001/api/${type}/${profileData.id}`);
      if (res.ok) {
        const data = await res.json();
        setModalUsers(data);
      }
    } catch (e) { console.error(e); }
    finally { setIsListLoading(false); }
  };

  const handleModalFollow = async (targetId) => {
    try {
      await fetch(`http://${window.location.hostname}:5001/api/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: loggedInUser.id, followingId: targetId })
      });
      setMyFollowingIds(prev => [...prev, targetId]);
      if (profileData && profileData.id === targetId) {
        setIsFollowing(true);
        setFollowCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
      showToast('Seguindo!', 'success');
    } catch (error) {
      console.error('Follow error:', error);
      showToast('Erro ao seguir.', 'error');
    }
  };

  const handleModalUnfollow = async (targetId) => {
    try {
      await fetch(`http://${window.location.hostname}:5001/api/follow`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: loggedInUser.id, followingId: targetId })
      });
      // Refresh the list
      setModalUsers(prev => prev.filter(u => u.id !== targetId));
      // Refresh main counts
      setFollowCounts(prev => ({ ...prev, following: Math.max(0, prev.following - 1) }));
    } catch (error) { console.error(error); }
  };

  const handleModalRemoveFollower = async (followerId) => {
    try {
      await fetch(`http://${window.location.hostname}:5001/api/followers/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: followerId, followingId: loggedInUser.id })
      });
      // Refresh the list
      setModalUsers(prev => prev.filter(u => u.id !== followerId));
      // Refresh main counts
      setFollowCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } catch (error) { console.error(error); }
  };

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`http://${window.location.hostname}:5001/api/user/${targetUsername}`);
        if (response.ok) {
          const data = await response.json();
          setProfileData(data);
          setUserNotFound(false);
        } else if (response.status === 404) {
          setUserNotFound(true);
        } else {
          console.error('Server error:', response.status);
          showToast('Erro ao carregar perfil. Tente novamente.', 'error');
        }
      } catch (error) {
        console.error('Connection error fetching profile:', error);
        showToast('Não foi possível conectar ao servidor.', 'error');
      }
    };
    if (targetUsername) fetchProfile();
  }, [targetUsername]);

  React.useEffect(() => {
    if (!profileData?.id) return;

    const fetchCounts = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:5001/api/follow/counts/${profileData.id}`);
        if (res.ok) {
          const data = await res.json();
          setFollowCounts(data);
        }
      } catch (e) { console.error(e); }
    };
    fetchCounts();

    if (loggedInUser?.id && loggedInUser.id !== profileData.id) {
      const fetchStatus = async () => {
        try {
          // Check if I follow them
          const res1 = await fetch(`http://${window.location.hostname}:5001/api/follow/status/${loggedInUser.id}/${profileData.id}`);
          if (res1.ok) {
            const data1 = await res1.json();
            setIsFollowing(data1.isFollowing);
          }
          // Check if they follow me
          const res2 = await fetch(`http://${window.location.hostname}:5001/api/follow/status/${profileData.id}/${loggedInUser.id}`);
          if (res2.ok) {
            const data2 = await res2.json();
            setIsFollower(data2.isFollowing);
          }
        } catch (e) { console.error(e); }
      };
      fetchStatus();
    }
  }, [profileData, loggedInUser]);

  const handleRemoveMeAsFollower = async () => {
    try {
      await fetch(`http://${window.location.hostname}:5001/api/followers/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: profileData.id, followingId: loggedInUser.id })
      });
      setIsFollower(false);
      showToast('Seguidor removido.', 'info');
    } catch (error) { console.error(error); }
  };

  const handleFollow = async () => {
    if (followLoading || !profileData?.id) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await fetch(`http://${window.location.hostname}:5001/api/follow`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: loggedInUser.id, followingId: profileData.id })
        });
        setIsFollowing(false);
        setFollowCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
      } else {
        await fetch(`http://${window.location.hostname}:5001/api/follow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: loggedInUser.id, followingId: profileData.id })
        });
        setIsFollowing(true);
        setFollowCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (error) {
      console.error('Follow error:', error);
      showToast('Erro ao processar.', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  React.useEffect(() => {
    const fetchUserPosts = async () => {
      try {
        const response = await fetch(`http://${window.location.hostname}:5001/api/posts`);
        if (response.ok) {
          const data = await response.json();
          const filteredPosts = data.filter(post => post.user_id === profileData?.id);
          setUserPosts(filteredPosts);

          if (loggedInUser?.id && filteredPosts.length > 0) {
            const likeResults = await Promise.all(
              filteredPosts.map(p =>
                fetch(`http://${window.location.hostname}:5001/api/likes/${p.id}?userId=${loggedInUser.id}`)
                  .then(r => r.ok ? r.json() : { count: 0, userLiked: false })
                  .then(d => ({ postId: p.id, count: d.count, liked: d.userLiked }))
              )
            );
            const map = {};
            likeResults.forEach(({ postId, count, liked }) => { map[postId] = { count, liked }; });
            setLikesState(map);
          }
        }
      } catch (error) {
        console.error('Error fetching user posts:', error);
      } finally {
        setIsLoadingUserPosts(false);
      }
    };

    if (profileData?.id) {
      fetchUserPosts();
      const interval = setInterval(fetchUserPosts, 1000);
      return () => clearInterval(interval);
    }
  }, [profileData]);

  const handleToggleLike = async (postId) => {
    if (!loggedInUser?.id) return;
    setLikesState(prev => {
      const cur = prev[postId] || { count: 0, liked: false };
      return { ...prev, [postId]: { count: cur.liked ? cur.count - 1 : cur.count + 1, liked: !cur.liked } };
    });
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/api/likes/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, userId: loggedInUser.id })
      });
      if (res.ok) {
        const data = await res.json();
        setLikesState(prev => ({ ...prev, [postId]: { count: data.count, liked: data.liked } }));
      }
    } catch (e) {
      console.error('Erro ao curtir:', e);
      setLikesState(prev => {
        const cur = prev[postId] || { count: 0, liked: false };
        return { ...prev, [postId]: { count: cur.liked ? cur.count - 1 : cur.count + 1, liked: !cur.liked } };
      });
    }
  };

  const handlePhotoUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append(type === 'profile' ? 'profileImage' : 'coverImage', file);
    formData.append('userId', loggedInUser.id);

    try {
      const endpoint = type === 'profile' ? '/api/upload/profile' : '/api/upload/cover';
      const response = await fetch(`http://${window.location.hostname}:5001${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        const updatedUser = {
          ...loggedInUser,
          [type === 'profile' ? 'profile_url' : 'cover_url']: type === 'profile' ? data.profile_url : data.cover_url
        };
        setUserData(updatedUser);
        setProfileData(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
        showToast('Foto atualizada com sucesso!', 'success');
      } else {
        showToast(data.message || 'Erro ao fazer upload da foto.', 'error');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      showToast('Falha na conexão com o servidor ao fazer upload.', 'error');
    }
  };

  return (
    <div className="feed-layout-container">
      <Navbar userData={loggedInUser} activePage={isOwnProfile ? 'profile' : ''} />

      <div className="profile-page-container">
        {userNotFound ? (
          <div className="profile-section-card empty-state">Usuário não encontrado.</div>
        ) : (
          <>
            <div className="profile-header-card">
              <input
                type="file"
                ref={coverInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'cover')}
              />
              <div
                className="profile-header-cover"
                style={{
                  backgroundImage: profileData?.cover_url ? `url(${getImageUrl(profileData.cover_url)})` : 'linear-gradient(135deg, #4b2c6e 0%, #1a1a1a 100%)',
                  cursor: isOwnProfile ? 'pointer' : 'default'
                }}
                onClick={() => isOwnProfile && coverInputRef.current.click()}
              >
                {isOwnProfile && (
                  <div className="upload-overlay">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                  </div>
                )}
              </div>
              <div className="profile-header-content">
                <div className="profile-header-pic-container">
                  <input
                    type="file"
                    ref={profileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, 'profile')}
                  />
                  <div
                    className="profile-header-pic"
                    style={{
                      backgroundImage: profileData?.profile_url ? `url(${getImageUrl(profileData.profile_url)})` : 'none',
                      backgroundColor: profileData?.profile_url ? 'transparent' : '#e1e8ed',
                      cursor: isOwnProfile ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onClick={() => isOwnProfile && profileInputRef.current.click()}
                  >
                    {!profileData?.profile_url && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                    )}
                    {isOwnProfile && (
                      <div className="upload-overlay pic-overlay">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                      </div>
                    )}
                  </div>
                </div>

                <div className="profile-header-info-main">
                  <div className="profile-info-header-top">
                    <div className="profile-names-and-stats">
                      <div className="profile-name-row">
                        <h1>{profileData?.name || 'Usuário'}</h1>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1d9bf0" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="verification-badge"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" stroke="white" /></svg>
                      </div>
                      <p className="profile-header-username">@{profileData?.username?.replace(/^@/, '') || 'user'}</p>
                    </div>

                    {!isOwnProfile && profileData && (
                      <button
                        className={`follow-btn ${isFollowing ? 'following' : ''}`}
                        onClick={handleFollow}
                        disabled={followLoading}
                      >
                        <span className="bt-text-main">
                          {followLoading ? '...' : isFollowing ? 'Seguindo' : (isFollower ? 'SEGUIR DE VOLTA' : 'Seguir')}
                        </span>
                        {isFollowing && <span className="bt-text-hover">Deixar de seguir</span>}
                      </button>
                    )}
                  </div>

                  <div className="profile-stats-row">
                    <div className="stat-item" onClick={() => fetchFollowList('followers')}>
                      <strong>{followCounts.followers}</strong> <span>Seguidores</span>
                    </div>
                    <div className="stat-item" onClick={() => fetchFollowList('following')}>
                      <strong>{followCounts.following}</strong> <span>Seguindo</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="profile-tabs">
                <div
                  className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('posts')}
                >
                  Publicações
                </div>
                <div
                  className={`tab ${activeTab === 'tags' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tags')}
                >
                  Marcações
                </div>
              </div>
            </div>

            <div className="profile-feed">
              {activeTab === 'posts' ? (
                <div className="posts-container" style={{ padding: '0 16px' }}>
                  {isLoadingUserPosts ? (
                    <div className="profile-section-card empty-state">Carregando publicações...</div>
                  ) : userPosts.length === 0 ? (
                    <div className="profile-section-card empty-state">
                      <h3>Nenhuma Publicação</h3>
                      <p>Este usuário ainda não fez nenhuma publicação.</p>
                    </div>
                  ) : (
                    userPosts.map((post) => (
                      <div key={post.id} className="post-card">
                        <div className="post-header">
                          <div
                            className="profile-pic-small"
                            style={{
                              width: '44px', height: '44px',
                              backgroundImage: post.profile_url ? `url(${getImageUrl(post.profile_url)})` : 'none',
                              backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: post.profile_url ? 'transparent' : '#e1e8ed',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            {!post.profile_url && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                            )}
                          </div>
                          <div className="post-author-info">
                            <div className="post-author-name">
                              <span className="author-name">{post.name}</span>
                              <span className="post-dot">·</span>
                              <span className="post-time">{formatRelativeTime(post.created_at)}</span>
                            </div>
                            <div className="post-author-username">
                              <span className="author-username">@{post.username.replace(/^@/, '')}</span>
                            </div>
                          </div>

                          <button
                            className="post-options-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === post.id ? null : post.id);
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                          </button>

                          {openMenuId === post.id && (
                            <div className="post-options-menu">
                              {loggedInUser?.id === post.user_id ? (
                                <>
                                  <button className="post-options-item" onClick={() => { setEditingPost(post); setEditorOpen(true); setOpenMenuId(null); }}>
                                    <span>Editar</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                  </button>
                                  <button className="post-options-item delete" onClick={(e) => handleDeletePost(e, post.id)}>
                                    <span>Excluir</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                  </button>
                                </>
                              ) : (
                                <button className="post-options-item" onClick={() => { setReportingPost(post); setOpenMenuId(null); }}>
                                  <span>Denunciar</span>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="post-content">
                          {post.content && <p className="post-text">{post.content}</p>}

                          {post.media && post.media.length > 0 && (() => {
                            const media = post.media;
                            const renderGridItem = (item, idx, cls = '') => (
                              <div key={idx} className={`media-grid-item ${cls}`}>
                                {item.type === 'video' ? (
                                  <video src={getImageUrl(item.url)} controls />
                                ) : (
                                  <img src={getImageUrl(item.url)} alt="" />
                                )}
                              </div>
                            );

                            if (media.length === 1) return <div className="media-grid media-grid-1">{renderGridItem(media[0], 0)}</div>;
                            if (media.length === 2) return <div className="media-grid media-grid-2">{renderGridItem(media[0], 0)}{renderGridItem(media[1], 1)}</div>;
                            if (media.length === 3) return (
                              <div className="media-grid media-grid-3">
                                {renderGridItem(media[0], 0, 'media-grid-main')}
                                <div className="media-grid-bottom">{renderGridItem(media[1], 1)}{renderGridItem(media[2], 2)}</div>
                              </div>
                            );
                            if (media.length <= 5) {
                              const rem = media.length - 4;
                              return (
                                <div className="media-grid media-grid-4">
                                  {renderGridItem(media[0], 0, 'media-grid-left')}
                                  <div className="media-grid-right-stack">
                                    {media.slice(1, 4).map((item, i) => {
                                      const idx = i + 1;
                                      return (
                                        <div key={idx} className="media-grid-item">
                                          <img src={getImageUrl(item.url)} alt="" />
                                          {idx === 3 && rem > 0 && <div className="media-grid-overlay"><span>+{rem}</span></div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            const rem6 = media.length - 4;
                            return (
                              <div className="media-grid media-grid-6plus">
                                {renderGridItem(media[0], 0, 'media-grid-main')}
                                <div className="media-grid-bottom">
                                  {renderGridItem(media[1], 1)}
                                  {renderGridItem(media[2], 2)}
                                  <div className="media-grid-item">
                                    <img src={getImageUrl(media[3].url)} alt="" />
                                    <div className="media-grid-overlay"><span>+{rem6}</span></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="post-stats" onClick={() => setShowLikesPostId(post.id)} style={{ cursor: 'pointer' }}>
                          {(() => {
                            const likeData = likesState[post.id] || { count: 0, liked: false };
                            return (
                              <>
                                <span className="stat-item">
                                  <strong>{likeData.count}</strong> {likeData.count === 1 ? 'Curtida' : 'Curtidas'}
                                </span>
                                <span className="stat-item">
                                  <strong>0</strong> Comentários
                                </span>
                              </>
                            );
                          })()}
                        </div>

                        <div className="post-footer-actions">
                          {(() => {
                            const likeData = likesState[post.id] || { count: 0, liked: false };
                            return (
                              <div
                                className={`post-action like-action ${likeData.liked ? 'liked' : ''}`}
                                onClick={() => handleToggleLike(post.id)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={likeData.liked ? "#f91880" : "none"} stroke={likeData.liked ? "#f91880" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.505 4.046 3 5.5L12 21Z" /></svg>
                                <span style={{ color: likeData.liked ? "#f91880" : undefined }}>Curtir</span>
                              </div>
                            );
                          })()}
                          <div className="post-action">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            <span>Comentar</span>
                          </div>
                          <div className="post-action">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
                            <span>Repostar</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="profile-section-card empty-state">
                  <h3>Marcações</h3>
                  <p>Fotos e postagens em que este usuário foi marcado aparecerão aqui.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Post Editor Modal */}
      <PostEditorModal
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingPost(null); }}
        initialPost={editingPost}
        userData={loggedInUser}
        showToast={showToast}
        onPostSuccess={() => { fetchUserPosts(); }}
      />

      {/* Follow / Following Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content users-list-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalTitle}</h3>
              <button className="close-modal" onClick={() => setIsModalOpen(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <div className="modal-body-scrollable">
              {isListLoading ? (
                <div className="loading-state">Carregando...</div>
              ) : modalUsers.length === 0 ? (
                <div className="loading-state">Nenhum usuário encontrado.</div>
              ) : (
                modalUsers.map(user => (
                  <div key={user.id} className="user-list-item">
                    <div className="user-list-item-left" onClick={() => {
                      window.history.pushState({}, '', `/${user.username.replace(/^@/, '')}`);
                      window.dispatchEvent(new Event('popstate'));
                      setIsModalOpen(false);
                    }} style={{ cursor: 'pointer' }}>
                      <div
                        className="user-list-avatar"
                        style={{
                          backgroundImage: user.profile_url ? `url(${getImageUrl(user.profile_url)})` : 'none',
                          backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: user.profile_url ? 'transparent' : '#e1e8ed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        {!user.profile_url && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                        )}
                      </div>
                      <div className="user-list-info">
                        <span className="user-list-name">{user.name}</span>
                        <span className="user-list-username">@{user.username.replace(/^@/, '')}</span>
                      </div>
                    </div>

                    <div className="user-list-actions">
                      {user.id !== loggedInUser?.id && (
                        myFollowingIds.includes(user.id) ? (
                          <button className="msg-btn-mini" onClick={() => showToast('Mensagens em breve!', 'info')}>
                            Enviar mensagem
                          </button>
                        ) : (
                          <button className="follow-btn-mini" onClick={() => handleModalFollow(user.id)}>
                            Seguir
                          </button>
                        )
                      )}
                      {isOwnProfile && (
                        <div className="user-list-menu-container">
                          <button className="dots-btn-mini" onClick={(e) => {
                            e.stopPropagation();
                            if (activeUserMenuId === user.id) setActiveUserMenuId(null);
                            else setActiveUserMenuId(user.id);
                          }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></svg>
                          </button>

                          {activeUserMenuId === user.id && (
                            <>
                              <div className="mini-menu-backdrop" onClick={() => setActiveUserMenuId(null)}></div>
                              <div className="mini-dropdown-menu">
                                {modalTitle === 'Seguindo' ? (
                                  <button className="danger-text" onClick={(e) => { e.stopPropagation(); handleModalUnfollow(user.id); setActiveUserMenuId(null); }}>
                                    <span>Parar de seguir</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                  </button>
                                ) : (
                                  <button className="danger-text" onClick={(e) => { e.stopPropagation(); handleModalRemoveFollower(user.id); setActiveUserMenuId(null); }}>
                                    <span>Remover seguidor</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={confirmDeletePost}
        title="Excluir publicação"
        message="Tem certeza que deseja excluir esta publicação? Esta ação não pode ser desfeita."
      />

      <UserLikesModal
        isOpen={!!showLikesPostId}
        onClose={() => setShowLikesPostId(null)}
        postId={showLikesPostId}
        title="Curtidas"
      />
    </div>
  );
}

const Notifications = ({ userData, showToast }) => {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const fetchNotifications = async (markRead = false) => {
      try {
        const res = await fetch(`http://${window.location.hostname}:5001/api/notifications/${userData.id}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
        if (markRead) {
          await fetch(`http://${window.location.hostname}:5001/api/notifications/read/${userData.id}`, { method: 'PUT' });
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setIsLoading(false);
      }
    };
    if (userData?.id) {
      fetchNotifications(true);
      const interval = setInterval(() => fetchNotifications(false), 5000);
      return () => clearInterval(interval);
    }
  }, [userData?.id]);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="notifications-layout">
      <Navbar userData={userData} activePage="notifications" />

      <div className="notifications-main">
        <div className="notifications-header">
          <h2>Notificações</h2>
        </div>

        <div className="notifications-list">
          {isLoading ? (
            <div className="notif-loading">Carregando notificações...</div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              <p>Nenhuma notificação ainda.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => navigateTo(`/${notif.username?.replace(/^@/, '')}`)}
              >
                <div className="notif-avatar-wrapper">
                  <div
                    className="notif-avatar"
                    style={notif.profile_url ? {
                      backgroundImage: `url(${getImageUrl(notif.profile_url)})`
                    } : {}}
                  >
                    {!notif.profile_url && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                    )}
                  </div>
                  {notif.type === 'like' && (
                    <div className="notif-icon-badge like">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                    </div>
                  )}
                  {notif.type === 'follow' && (
                    <div className="notif-icon-badge follow">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                    </div>
                  )}
                  {notif.type === 'unfollow' && (
                    <div className="notif-icon-badge unfollow">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
                    </div>
                  )}
                </div>

                <div className="notif-body">
                  <p className="notif-text">
                    <strong>{notif.name}</strong>{' '}
                    {notif.type === 'follow' ? 'começou a seguir você' :
                      notif.type === 'unfollow' ? 'parou de seguir você' :
                        notif.type === 'like' ? 'curtiu sua publicação' :
                          notif.type}
                  </p>
                  <p className="notif-time">{formatRelativeTime(notif.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};


const BrandLogo = () => (
  <div className="brand-logo-container">
    <div className="logo-main">
      <span className="logo-bold">ARQUIVOS</span>
      <span className="logo-thin">gta</span>
    </div>
  </div>
);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
  const [userData, setUserData] = useState(JSON.parse(localStorage.getItem('userData')));
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [showToastMsg, setShowToastMsg] = useState(false);
  const [toastContent, setToastContent] = useState({ message: '', type: '' });
  const [isSignUp, setIsSignUp] = useState(false);
  const [regStep, setRegStep] = useState(1);

  React.useEffect(() => {
    // Busca Token CSRF para proteção Anti-CSRF
    fetch(`http://${window.location.hostname}:5001/api/csrf`)
      .then(res => res.json())
      .then(data => {
        if (data.csrfToken) localStorage.setItem('csrfToken', data.csrfToken);
      })
      .catch(err => console.error('Error fetching CSRF token', err));

    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showToast = (message, type = 'success') => {
    setToastContent({ message, type });
    setShowToastMsg(true);
    setTimeout(() => setShowToastMsg(false), 3000);
  };

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    identifier: '',
    email: '',
    password: '',
    confirmPassword: '',
    birthDate: '',
    acceptedTerms: false
  });

  const handleChange = (e) => {
    let value = e.target.value;
    if (e.target.name === 'username') {
      const cleanValue = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^@+/, '');
      const restrictedValue = cleanValue.replace(/[^a-zA-Z0-9._]/g, '');
      value = '@' + restrictedValue;
    }

    setFormData({
      ...formData,
      [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : value
    });
  };

  const handleToggle = () => {
    setIsSignUp(!isSignUp);
    setRegStep(1);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const identifier = e.target.identifier.value;
    const password = e.target.password.value;

    try {
      const response = await fetch(`http://${window.location.hostname}:5001/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsLoggedIn(true);
        setUserData(data.user);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(data.user));
        showToast('Login realizado com sucesso!', 'success');
        window.history.pushState({}, '', '/feed');
        setCurrentPath('/feed');
      } else {
        showToast(data.message || 'Credenciais inválidas.', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Falha na conexão com o servidor.', 'error');
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      showToast('As senhas não coincidem.', 'error');
      return;
    }

    try {
      const response = await fetch(`http://${window.location.hostname}:5001/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        showToast('Cadastro realizado com sucesso!', 'success');
        setIsLoggedIn(true);
        setUserData(data.user);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(data.user));
        window.history.pushState({}, '', '/feed');
        setCurrentPath('/feed');
      } else {
        showToast(data.message || 'Erro ao processar solicitação.', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Falha na conexão com o servidor.', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`http://${window.location.hostname}:5001/api/logout`, {
        method: 'POST'
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setIsLoggedIn(false);
    setUserData(null);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userData');
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  if (isLoggedIn) {
    if (currentPath === '/notificacoes') {
      return (
        <>
          <Notifications userData={userData} showToast={showToast} />
          {showToastMsg && <div className={`toast ${toastContent.type}`}>{toastContent.message}</div>}
        </>
      );
    }
    if (currentPath !== '/feed' && currentPath !== '/') {
      const targetUsername = currentPath.substring(1);
      return (
        <>
          <Profile targetUsername={targetUsername} loggedInUser={userData} setUserData={setUserData} showToast={showToast} />
          {showToastMsg && <div className={`toast ${toastContent.type}`}>{toastContent.message}</div>}
        </>
      );
    }
    return (
      <>
        <Home userData={userData} onLogout={handleLogout} setUserData={setUserData} showToast={showToast} />
        {showToastMsg && <div className={`toast ${toastContent.type}`}>{toastContent.message}</div>}
      </>
    );
  }

  return (
    <div className="auth-layout">
      <div className={`container ${isSignUp ? 'right-panel-active' : ''}`} id="container">
        <div className="form-container sign-up-container">
          <form onSubmit={handleSignUpSubmit}>
            <BrandLogo />
            <h1>Criar Conta</h1>
            {regStep === 1 ? (
              <>
                <input type="text" placeholder="Nome Completo" name="name" value={formData.name} onChange={handleChange} required />
                <input type="text" placeholder="@username" name="username" value={formData.username} onChange={handleChange} required />
                <input type="email" placeholder="Email" name="email" value={formData.email} onChange={handleChange} required />
                <button type="button" className="ghost" onClick={() => setRegStep(2)} style={{ marginTop: '10px', color: '#000', borderColor: '#000' }}>Próximo</button>
              </>
            ) : (
              <>
                <input type="date" placeholder="Data de Nascimento" name="birthDate" value={formData.birthDate} onChange={handleChange} required />
                <input type="password" placeholder="Senha" name="password" value={formData.password} onChange={handleChange} required />
                <input type="password" placeholder="Confirmar Senha" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required />
                <div className="button-group">
                  <button type="button" className="ghost" onClick={() => setRegStep(1)} style={{ color: '#000', borderColor: '#000' }}>Voltar</button>
                  <button type="submit">Cadastrar</button>
                </div>
              </>
            )}
          </form>
        </div>
        <div className="form-container sign-in-container">
          <form onSubmit={handleLoginSubmit}>
            <BrandLogo />
            <h1>Entrar</h1>
            <input type="text" placeholder="Usuário, Email ou Identificador" name="identifier" required />
            <input type="password" placeholder="Senha" name="password" required />
            <a href="#">Esqueceu sua senha?</a>
            <button type="submit">Entrar</button>
          </form>
        </div>
        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>Bem-vindo de volta!</h1>
              <p>Para manter-se conectado conosco, faça o login com suas informações pessoais</p>
              <button className="ghost" id="signIn" onClick={handleToggle}>Entrar</button>
            </div>
            <div className="overlay-panel overlay-right">
              <h1>Olá, Gamer!</h1>
              <p>Insira seus dados pessoais e comece sua jornada conosco</p>
              <button className="ghost" id="signUp" onClick={handleToggle}>Cadastrar</button>
            </div>
          </div>
        </div>
      </div>
      {showToastMsg && <div className={`toast ${toastContent.type}`}>{toastContent.message}</div>}
    </div>
  );
}

export default App;
