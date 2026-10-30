/* ESTUDNEXA 4.0 — perfis e comunidade. API pública com Supabase Auth e políticas RLS.
 * Preserve os dados antigos MedAtlas, a chave do projeto e o progresso existente.
 */
(() => {
  'use strict';
  let client=null, user=null, myProfile=null, posts=[], profiles=new Map(), comments=new Map(), likes=new Set(), photoUrls=new Map();
  let feedTopic='Todas', loading=false, lastError='', view='profile', signedFiles=new Map();
  const $=id=>document.getElementById(id);
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topicChoices=['Geral','Anatomia','Fisiologia','Patologia','Farmacologia','Clínica Médica','Cirurgia Geral','Pediatria','GO','Preventiva','Radiologia','Residência'];
  const errorText=e=>e?.message||'Não foi possível concluir a operação.';
  const notice=(s,kind='')=>{const n=$('mc-status');if(n){n.className='mc-notice'+(kind?' mc-'+kind:'');n.textContent=s;n.hidden=false;}};
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
  const formatDate=v=>{try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return '';}};
  const initials=s=>String(s||'Estudante').trim().slice(0,1).toLocaleUpperCase('pt-BR');
  const root=()=> $('main-content');
  const avatar=(p,large=false)=>{
    const path=p?.avatar_path;
    const url=path&&photoUrls.get(path);
    const cn='mc-avatar'+(large?' lg':'');
    return url?`<img class="${cn}" src="${escapeHtml(url)}" alt="Foto de perfil">`:`<span class="${cn}" aria-label="Foto não disponível">${escapeHtml(initials(p?.display_name))}</span>`;
  };
  function init(c,u){client=c;user=u;myProfile=null;posts=[];profiles=new Map();comments=new Map();likes=new Set();photoUrls=new Map();signedFiles=new Map();loading=false;lastError='';}
  function hasSession(){return Boolean(client&&user?.id);}
  async function refreshProfile(){
    const {data,error}=await client.from('student_profiles').select('user_id,display_name,university,study_period,city,biography,interests,avatar_path,is_visible').eq('user_id',user.id).maybeSingle();
    if(error) throw error;myProfile=data||null;
    if(myProfile){profiles.set(user.id,myProfile);if(myProfile.avatar_path)await photo(myProfile.avatar_path);}
  }
  async function photo(path){
    if(!path||photoUrls.has(path))return;
    const {data,error}=await client.storage.from('student-avatars').createSignedUrl(path,1800);
    if(!error&&data?.signedUrl)photoUrls.set(path,data.signedUrl);
  }
  function validateFile(file,avatarFile=false){
    if(!file || !file.size)throw Error('Escolha um arquivo válido.');
    const mime=avatarFile?['image/jpeg','image/png','image/webp']:['application/pdf','image/jpeg','image/png','image/webp'];
    if(!mime.includes(file.type))throw Error('Formato não permitido. Use PDF, JPG, PNG ou WebP.');
    const limit=avatarFile?2*1024*1024:8*1024*1024;
    if(file.size>limit)throw Error(`O arquivo excede o limite de ${avatarFile?2:8} MB.`);
    const ext=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];
    return {ext};
  }
  async function upload(file,avatarFile=false){
    const {ext}=validateFile(file,avatarFile);
    const bucket=avatarFile?'student-avatars':'community-materials';
    const path=`${user.id}/${uuid()}.${ext}`;
    const {error}=await client.storage.from(bucket).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error)throw error;
    return {path,bucket};
  }
  function basicProfile(){return `<div class="mc-panel"><div class="mc-profilehero">${avatar(myProfile,true)}<div><h2>${escapeHtml(myProfile?.display_name||'Seu perfil acadêmico')}</h2><p class="mc-profiletag">${escapeHtml(myProfile?.university||'Preencha seus dados para participar da comunidade')}</p></div></div><p class="mc-muted">Seu e-mail e sua senha não aparecem no perfil público. Você pode ocultar seu perfil a qualquer momento.</p></div>`;}
  function profileUI(){return `<div class="mc-header"><div class="mc-topic">SUA IDENTIDADE ACADÊMICA</div><h1>Meu perfil</h1><p>Apresente sua trajetória para outros estudantes de Medicina.</p></div><div class="mc-layout"><div class="mc-stack">${basicProfile()}<section class="mc-panel"><h2>Editar perfil</h2><form id="mc-profile-form" class="mc-form">
    <label class="mc-label">Nome público *<input name="display_name" maxlength="80" minlength="2" required placeholder="Como quer ser chamado(a)" value="${escapeHtml(myProfile?.display_name||'')}"></label>
    <div class="mc-formtwo"><label class="mc-label">Universidade<input name="university" maxlength="140" placeholder="Sua instituição" value="${escapeHtml(myProfile?.university||'')}"></label><label class="mc-label">Período do curso<select name="study_period"><option value="">Prefiro não informar</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${Number(myProfile?.study_period)===i+1?'selected':''}>${i+1}º período</option>`).join('')}</select></label></div>
    <label class="mc-label">Cidade (opcional)<input name="city" maxlength="80" placeholder="Cidade e estado" value="${escapeHtml(myProfile?.city||'')}"></label>
    <label class="mc-label">Interesses e área favorita<input name="interests" maxlength="200" placeholder="Clínica médica, cirurgia, pesquisa..." value="${escapeHtml(myProfile?.interests||'')}"></label>
    <label class="mc-label">Sua apresentação<textarea name="biography" maxlength="400" placeholder="Conte um pouco sobre seus interesses acadêmicos">${escapeHtml(myProfile?.biography||'')}</textarea></label>
    <label class="mc-label">Foto de perfil (JPG, PNG ou WebP, até 2 MB)<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label class="mc-check"><input name="is_visible" type="checkbox" ${myProfile?.is_visible===false?'':'checked'}> Exibir meu perfil para estudantes conectados</label>
    <button type="submit" class="btn btn-primary">Salvar perfil</button>
  </form></section></div><div class="mc-stack"><aside class="mc-panel"><h2>Comunidade ESTUDNEXA</h2><p>Compartilhe resumos, faça perguntas e aprenda com estudantes de outras instituições.</p><button data-nav="community" class="btn btn-primary btn-small">Abrir comunidade →</button></aside><div class="mc-notice mc-warning">⚠ Nunca publique dados de pacientes, imagens identificáveis, provas sigilosas ou materiais sem autorização de compartilhamento.</div></div></div><div id="mc-status" class="mc-notice" hidden></div>`;}
  function authorName(uid){return profiles.get(uid)?.display_name||'Estudante';}
  function author(p){const pf=profiles.get(p.author_id);return `<div class="mc-post-meta">${avatar(pf)}<span><strong>${escapeHtml(authorName(p.author_id))}</strong><span style="display:block">${escapeHtml(pf?.university||'Comunidade acadêmica')} · ${escapeHtml(formatDate(p.created_at))}</span></span></div>`;}
  function commentUI(c){return `<div class="mc-comment"><b>${escapeHtml(authorName(c.author_id))} · ${escapeHtml(formatDate(c.created_at))}</b><p>${escapeHtml(c.content)}</p></div>`;}
  function postUI(p){const cs=comments.get(p.id)||[];return `<article class="mc-post" data-post-id="${escapeHtml(p.id)}">${author(p)}<span class="mc-topic">${escapeHtml(p.topic)}</span><h3>${escapeHtml(p.title)}</h3><p class="mc-content">${escapeHtml(p.content)}</p>${p.file_path?`<button type="button" class="mc-file" data-mc="file" data-post="${escapeHtml(p.id)}">📎 Abrir ${escapeHtml(p.file_name||'material de estudo')}</button>`:''}<div class="mc-actions"><button type="button" data-mc="like" data-post="${escapeHtml(p.id)}" class="${likes.has(p.id)?'active':''}">♡ ${likes.has(p.id)?'Curtido':'Curtir'}</button><span class="mc-muted">${cs.length} comentários</span>${p.author_id===user.id?`<button type="button" data-mc="delete-post" data-post="${escapeHtml(p.id)}">Excluir</button>`:`<button type="button" class="mc-report" data-mc="report" data-post="${escapeHtml(p.id)}">Denunciar</button>`}</div><div>${cs.map(commentUI).join('')}</div><form data-mc-form="comment" data-post="${escapeHtml(p.id)}" class="mc-commentform"><input name="content" maxlength="1500" required placeholder="Escrever comentário..." aria-label="Escrever comentário"><button type="submit" class="btn btn-primary btn-small">Enviar</button></form></article>`;}
  function communityUI(){const filtered=posts.filter(p=>feedTopic==='Todas'||p.topic===feedTopic);return `<div class="mc-header"><div class="mc-topic">ESTUDAR É CONECTAR</div><h1>Comunidade ESTUDNEXA</h1><p>Descubra materiais, troque conhecimentos e fortaleça sua formação médica.</p></div><div class="mc-layout"><div class="mc-stack"><section class="mc-panel"><h2>Compartilhar conhecimento</h2><form id="mc-post-form" class="mc-form"><label class="mc-label">Disciplina<select name="topic">${topicChoices.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select></label><label class="mc-label">Título do material ou dúvida *<input name="title" maxlength="160" minlength="5" required placeholder="Ex.: Mapa mental de cardiologia"></label><label class="mc-label">Descrição *<textarea name="content" required maxlength="5000" placeholder="Explique o conteúdo ou faça sua pergunta"></textarea></label><label class="mc-label">Anexar PDF ou imagem (opcional, até 8 MB)<input name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"></label><div class="mc-legal">Publique apenas conteúdo próprio ou com permissão e sem dados identificáveis de pacientes. Materiais compartilhados serão acessíveis a outros usuários autenticados.</div><button type="submit" class="btn btn-primary">Publicar na comunidade</button></form></section><section class="mc-panel"><div class="mc-btnrow"><h2>Publicações recentes</h2><button type="button" class="btn btn-outline btn-small" data-mc="reload">↻ Atualizar</button></div><div class="mc-toolbar"><label for="mc-topic-filter">Filtrar:</label><select id="mc-topic-filter"><option value="Todas">Todas</option>${topicChoices.map(x=>`<option ${x===feedTopic?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div><div id="mc-feed">${loading?'<div class="mc-empty">Carregando comunidade...</div>':lastError?`<div class="mc-notice mc-error">${escapeHtml(lastError)}</div>`:filtered.length?filtered.map(postUI).join(''):'<div class="mc-empty"><span class="mc-bubble">✚</span>Este espaço está pronto para a primeira publicação!</div>'}</div></section></div><div class="mc-stack"><aside class="mc-panel"><h2>Seu perfil</h2><div class="mc-flex">${avatar(myProfile)}<span><b>${escapeHtml(myProfile?.display_name||'Estudante')}</b><br><small>${escapeHtml(myProfile?.university||'Dados acadêmicos não preenchidos')}</small></span></div><p class="mc-hint">Personalize seu perfil para outros estudantes conhecerem sua trajetória.</p><button type="button" class="btn btn-outline btn-small" data-nav="profile">Editar perfil →</button></aside><aside class="mc-notice mc-warning"><strong>Comunidade responsável</strong><p>Não poste dados de pacientes ou conteúdo com direitos autorais sem autorização. Denuncie conteúdos inadequados.</p><p>As publicações são educacionais e não substituem orientações clínicas.</p></aside></div></div><div id="mc-status" class="mc-notice" hidden></div>`;}
  function draw(next,node){view=next; if(!hasSession()){node.innerHTML='<section class="mc-panel">Entre na sua conta para participar.</section>';return;}node.innerHTML=next==='profile'?profileUI():communityUI();if(next==='profile'&&!myProfile){loadProfile();}else if(next==='community'&&(!posts.length||!myProfile)&&!loading){reload();}}
  let busyProfile=false;
  async function loadProfile(){if(busyProfile||!hasSession())return;busyProfile=true;try{await refreshProfile();if(view==='profile')root().innerHTML=profileUI();}catch(e){notice('Não foi possível carregar perfil: '+errorText(e),'error');}finally{busyProfile=false;}}
  async function reload(){if(loading||!hasSession())return;loading=true;lastError='';const topic=feedTopic;try{
    await refreshProfile();
    const {data,error}=await client.from('community_posts').select('id,author_id,topic,title,content,file_path,file_name,file_type,status,created_at').order('created_at',{ascending:false}).limit(40);
    if(error)throw error;posts=data||[];
    const authors=[...new Set([user.id,...posts.map(p=>p.author_id)])];
    if(authors.length){const {data:pf,error:pe}=await client.from('student_profiles').select('user_id,display_name,university,study_period,city,biography,interests,avatar_path,is_visible').in('user_id',authors);if(pe)throw pe;profiles=new Map((pf||[]).map(x=>[x.user_id,x]));}
    const ids=posts.map(p=>p.id);comments=new Map();likes=new Set();
    if(ids.length){const [cr,lr]=await Promise.all([client.from('community_comments').select('id,post_id,author_id,content,created_at').in('post_id',ids).order('created_at',{ascending:true}).limit(500),client.from('community_likes').select('post_id,user_id').in('post_id',ids).eq('user_id',user.id)]);
      if(cr.error)throw cr.error;if(lr.error)throw lr.error;
      for(const c of(cr.data||[])){if(!comments.has(c.post_id))comments.set(c.post_id,[]);comments.get(c.post_id).push(c);}
      likes=new Set((lr.data||[]).map(x=>x.post_id));
      const commentAuthors=[...new Set((cr.data||[]).map(x=>x.author_id))].filter(x=>!profiles.has(x));
      if(commentAuthors.length){const {data:cp}=await client.from('student_profiles').select('user_id,display_name,avatar_path,university').in('user_id',commentAuthors);for(const pp of cp||[])profiles.set(pp.user_id,pp);}
    }
    await Promise.allSettled([...profiles.values()].map(p=>photo(p.avatar_path)));
  }catch(e){lastError='Falha ao carregar a comunidade: '+errorText(e);}finally{loading=false;if(view==='community')root().innerHTML=communityUI();}}
  async function submitProfile(f){const data=new FormData(f),display_name=String(data.get('display_name')||'').trim();if(display_name.length<2||display_name.length>80)throw Error('Nome público deve ter de 2 a 80 caracteres.');
    const avatarFile=f.elements.avatar.files?.[0];let avatar_path=myProfile?.avatar_path||null;let uploaded;
    if(avatarFile){uploaded=await upload(avatarFile,true);avatar_path=uploaded.path;}
    const row={user_id:user.id,display_name,university:String(data.get('university')||'').trim(),study_period:data.get('study_period')?Number(data.get('study_period')):null,city:String(data.get('city')||'').trim(),biography:String(data.get('biography')||'').trim(),interests:String(data.get('interests')||'').trim(),avatar_path,is_visible:data.has('is_visible')};
    const {error}=await client.from('student_profiles').upsert(row,{onConflict:'user_id'});
    if(error){if(uploaded)await client.storage.from('student-avatars').remove([uploaded.path]);throw error;}
    await refreshProfile();root().innerHTML=profileUI();notice('Perfil atualizado com sucesso!');
  }
  async function submitPost(f){const data=new FormData(f);const title=String(data.get('title')||'').trim(),content=String(data.get('content')||'').trim(),topic=String(data.get('topic')||'Geral');
    if(title.length<5||content.length<1||!topicChoices.includes(topic))throw Error('Confira o título, a disciplina e a descrição.');
    let uploaded=null,file_path=null,file_name=null,file_type=null;
    const file=f.elements.attachment.files?.[0];if(file){uploaded=await upload(file,false);file_path=uploaded.path;file_name=file.name.slice(0,180);file_type=file.type;}
    const {error}=await client.from('community_posts').insert({author_id:user.id,topic,title,content,file_path,file_name,file_type});
    if(error){if(uploaded)await client.storage.from('community-materials').remove([uploaded.path]);throw error;}
    feedTopic='Todas';await reload();notice('Publicação enviada à comunidade!');
  }
  async function postComment(f){const id=f.dataset.post;const content=String(new FormData(f).get('content')||'').trim();if(!content)return;const {error}=await client.from('community_comments').insert({post_id:id,author_id:user.id,content});if(error)throw error;await reload();notice('Comentário publicado!');}
  async function onClick(b){const id=b.dataset.post,action=b.dataset.mc;if(action==='reload'){await reload();return;}
    const p=posts.find(x=>x.id===id);if(!p)throw Error('Publicação indisponível.');
    if(action==='like'){
      if(likes.has(id)){const {error}=await client.from('community_likes').delete().eq('post_id',id).eq('user_id',user.id);if(error)throw error;likes.delete(id);}
      else{const {error}=await client.from('community_likes').insert({post_id:id,user_id:user.id});if(error)throw error;likes.add(id);}
      root().innerHTML=communityUI();
    }else if(action==='delete-post'){
      if(p.author_id!==user.id||!confirm('Excluir esta publicação definitivamente?'))return;
      const {error}=await client.from('community_posts').delete().eq('id',id).eq('author_id',user.id);if(error)throw error;
      // Keep the file private, but avoid deleting prematurely before data deletion succeeds.
      if(p.file_path)await client.storage.from('community-materials').remove([p.file_path]);
      await reload();notice('Publicação excluída.');
    }else if(action==='report'){
      const choices='1 — Privacidade e dados de pacientes\n2 — Direitos autorais\n3 — Spam\n4 — Assédio\n5 — Informação médica perigosa\n6 — Outro';
      const choice=prompt('Por que deseja denunciar?\n'+choices);if(choice===null)return;
      const reason=({'1':'privacidade','2':'direitos_autorais','3':'spam','4':'assedio','5':'informacao_perigosa','6':'outro'})[choice.trim()];if(!reason){notice('Escolha uma opção de 1 a 6.','warning');return;}
      const {error}=await client.from('community_reports').insert({post_id:id,reporter_id:user.id,reason});if(error)throw error;notice('Denúncia registrada. Obrigado por ajudar a comunidade.');
    }else if(action==='file'){
      // Private bucket: a signed link expires after five minutes.
      if(!p.file_path)return;const {data,error}=await client.storage.from('community-materials').createSignedUrl(p.file_path,300);if(error)throw error;
      const url=new URL(data.signedUrl,location.origin);if(url.origin!=='https://iwrfxnzgjdfxlpphbjbb.supabase.co')throw Error('Arquivo possui origem inesperada.');
      window.open(url.href,'_blank','noopener,noreferrer');
    }
  }
  document.addEventListener('submit',async e=>{const f=e.target;if(!f?.id?.startsWith('mc-')&&!f?.matches('[data-mc-form]'))return;e.preventDefault();if(!hasSession())return;
    const btn=f.querySelector('button[type=submit]');if(btn?.disabled)return;if(btn)btn.disabled=true;
    try{if(f.id==='mc-profile-form')await submitProfile(f);else if(f.id==='mc-post-form')await submitPost(f);else if(f.dataset.mcForm==='comment')await postComment(f);}
    catch(err){notice(errorText(err),'error');}
    finally{if(btn&&btn.isConnected)btn.disabled=false;}
  });
  document.addEventListener('click',async e=>{const b=e.target.closest('button[data-mc]');if(!b||!hasSession())return;e.preventDefault();if(b.disabled)return;b.disabled=true;try{await onClick(b);}catch(err){notice(errorText(err),'error');}finally{if(b.isConnected)b.disabled=false;}});
  document.addEventListener('change',e=>{if(e.target?.id==='mc-topic-filter'){feedTopic=e.target.value;if(view==='community')root().innerHTML=communityUI();}});
  window.MedAtlasCommunity={init,draw};
})();
