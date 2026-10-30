/* MedAtlas 3.0 — autenticação real, dados isolados por usuário, sincronização com controle de revisão.
   REQUER: projeto Supabase, config.js preenchido e schema.sql aplicado.
   Não armazena senhas ou chaves privilegiadas neste código. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG = window.MEDATLAS_CONFIG || {};
  const userPrefix = 'medatlas-user-v3-';
  const dirtyPrefix = 'medatlas-unsynced-v3-';
  const oldLocalKey = 'medatlas_free_v1';
  let client, user, revision=0, currentRow=null, localKey='', dirtyKey='', dirty=false;
  let serial=0, saving=false, blocked=false, saveTimer, loading=false, pollId;
  let tab='login', recovering=false;
  const cloud = window.MedAtlasCloud = {
    localKey: '',
    onSave(snapshot) {
      if (!user || blocked) return;
      dirty=true; serial++;
      try {localStorage.setItem(dirtyKey,'1');} catch {}
      status('Aguardando sincronização','warning');
      schedule();
    }
  };
  function status(message,kind='') {
    const el=$('sync-status'); if(!el) return;
    el.className='cloud-top'+(kind?' '+kind:''); el.textContent='☁ '+message;
  }
  function alertMsg(message,error=false){const el=$('auth-banner');el.hidden=false;el.textContent=message;el.className='auth-alert'+(error?' error':'');}
  function clearAlert(){ $('auth-banner').hidden=true; }
  function setBusy(value){ $('auth-submit').disabled=value; $('auth-submit').textContent=value?'Aguarde...':tab==='login'?'Entrar na ESTUDNEXA':'Criar minha conta'; }
  function showAuth(){ $('app').hidden=true; $('auth-screen').hidden=false; }
  function showReset(){ recovering=true; $('auth-screen').hidden=true; $('app').hidden=true; $('reset-screen').hidden=false; }
  function schedule(delay=850){clearTimeout(saveTimer);saveTimer=setTimeout(flush,delay);}
  async function loadSDK(){
    if(window.supabase?.createClient) return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.2/dist/umd/supabase.min.js';
      script.onload=resolve;script.onerror=()=>reject(Error('Não foi possível carregar a biblioteca de autenticação. Verifique sua conexão.'));
      document.head.appendChild(script);
    });
    if(!window.supabase?.createClient) throw Error('Biblioteca de autenticação indisponível.');
  }
  function usableConfig(){
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(CONFIG.supabaseUrl||'') &&
      (String(CONFIG.publishableKey||'').startsWith('sb_publishable_') || String(CONFIG.publishableKey||'').startsWith('eyJ'));
  }
  function restoredState(){try{return JSON.parse(localStorage.getItem(localKey)||'null');}catch{return null;}}
  function isSnapshot(s){return !!(s&&s.profile&&Array.isArray(s.tasks)&&Array.isArray(s.cards)&&Array.isArray(s.questions)&&Array.isArray(s.answers));}
  function storeSnapshot(s){try{localStorage.setItem(localKey,JSON.stringify(s));}catch{status('Armazenamento indisponível','error');}}
  async function fetchRemote(){
    const {data,error}=await client.from('medatlas_state').select('data,revision').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    return data;
  }
  function injectApp(){
    return new Promise((resolve,reject)=>{
      if(window.MedAtlasApp){resolve();return;}
      const script=document.createElement('script');script.src='./app.js';
      script.onload=()=>window.MedAtlasApp?resolve():reject(Error('O módulo de estudo não iniciou.'));
      script.onerror=()=>reject(Error('Falha ao carregar as ferramentas de estudo.'));
      document.body.appendChild(script);
    });
  }
  async function boot(sessionUser){
    if(loading || window.MedAtlasApp) return;
    loading=true;user=sessionUser;
    localKey=userPrefix+user.id;dirtyKey=dirtyPrefix+user.id;cloud.localKey=localKey;
    $('current-email').textContent=user.email||'Minha conta';
    $('auth-screen').hidden=true;
    $('app').hidden=false;
    status('Carregando dados...');
    try {
      const local=restoredState();
      const wasDirty=localStorage.getItem(dirtyKey)==='1';
      let remote;
      try {remote=await fetchRemote();}catch(e){
        // Somente abrir offline se existirem dados anteriormente associados a esta conta.
        if(!navigator.onLine && isSnapshot(local)){
          status('Offline — dados deste dispositivo','warning');
          dirty=wasDirty;window.MedAtlasCommunity?.init(client,user);await injectApp();connectControls();startPolling();return;
        }
        throw Error('Não foi possível abrir os dados da sua conta. Confira a configuração da tabela e das permissões: '+e.message);
      }
      currentRow=remote;
      revision=Number(remote?.revision||0);
      if(remote && !isSnapshot(remote.data)) throw Error('O servidor retornou dados de estudo inválidos. Não vamos substituí-los automaticamente.');
      if(remote && isSnapshot(remote.data)){
        if(wasDirty && isSnapshot(local) && JSON.stringify(local)!==JSON.stringify(remote.data)){
          dirty=true;blocked=true;
          status('Conflito: escolha uma versão','error');
          $('sync-warning').hidden=false;
          // Mantém os dados locais sem enviá-los até o usuário escolher.
        } else {
          storeSnapshot(remote.data);
          try {localStorage.removeItem(dirtyKey);}catch{}
        }
      } else if (!remote && !isSnapshot(local)) {
        let legacy;
        try { legacy=JSON.parse(localStorage.getItem(oldLocalKey)||'null'); }catch{}
        if(isSnapshot(legacy) && !localStorage.getItem('medatlas-legacy-import-attempted')){
          const importOld=window.confirm('Há estudos da versão anterior neste dispositivo. Deseja importá-los para sua nova conta?');
          localStorage.setItem('medatlas-legacy-import-attempted','1');
          if(importOld)storeSnapshot(legacy);
        }
      }
      window.MedAtlasCommunity?.init(client,user);
      await injectApp();
      connectControls();startPolling();
      if(!remote){dirty=true;serial++;try{localStorage.setItem(dirtyKey,'1');}catch{}schedule(50);}
      else if(!blocked){dirty=false;status('Sincronizado');}
    } catch(e){
      $('app').hidden=true;$('auth-screen').hidden=false;
      alertMsg(e.message||'Erro de sincronização.',true);
    } finally{loading=false;}
  }
  function connectControls(){
    $('signout-button').onclick=async()=>{
      if(blocked){window.alert('Resolva o conflito entre dispositivos antes de sair. Faça um backup dos seus estudos.');return;}
      if(dirty){
        if(!navigator.onLine){window.alert('Há dados sem sincronizar. Conecte-se à internet antes de sair ou faça backup.');return;}
        await flush();
        if(dirty){window.alert('Não foi possível terminar a sincronização. Faça backup e tente novamente antes de sair.');return;}
      }
      const {error}=await client.auth.signOut();
      if(error){window.alert('Falha ao sair: '+error.message);return;}
      try{localStorage.removeItem(localKey);localStorage.removeItem(dirtyKey);}catch{}
      location.reload();
    };
    $('choose-cloud').onclick=()=>{
      if(!currentRow) return;
      if(!window.confirm('Substituir alterações locais pela versão da nuvem? Dados locais não sincronizados serão perdidos.'))return;
      window.MedAtlasApp.replaceState(currentRow.data);revision=Number(currentRow.revision);
      dirty=false;blocked=false;serial++;
      localStorage.removeItem(dirtyKey);$('sync-warning').hidden=true;status('Sincronizado');
    };
    $('choose-local').onclick=()=>{
      if(!window.confirm('Enviar dados deste dispositivo e substituir os da nuvem? ATENÇÃO: exporte um backup antes de continuar.'))return;
      revision=Number(currentRow?.revision||0);blocked=false;dirty=true;serial++;
      $('sync-warning').hidden=true;status('Enviando dados locais...','warning');schedule(0);
    };
    const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.textContent='Excluir conta e dados';
    deleteButton.className='auth-link';deleteButton.style.fontSize='11px';
    deleteButton.title='Exclusão definitiva da conta e do progresso na nuvem';
    deleteButton.onclick=async()=>{
      if(!window.confirm('Excluir DEFINITIVAMENTE sua conta ESTUDNEXA e os dados de estudo da nuvem? Esta ação não pode ser desfeita. Faça backup antes.'))return;
      const typed=window.prompt('Digite EXCLUIR para confirmar a exclusão definitiva:');
      if(typed!=='EXCLUIR')return;
      if(dirty){window.alert('Há mudanças pendentes: exporte seu backup antes da exclusão.');return;}
      const {error}=await client.rpc('medatlas_delete_my_account');
      if(error){window.alert('Não foi possível excluir a conta: '+error.message);return;}
      try{localStorage.removeItem(localKey);localStorage.removeItem(dirtyKey);}catch{}
      await client.auth.signOut();location.reload();
    };
    $('signout-button').insertAdjacentElement('afterend',deleteButton);
  }
  async function flush(){
    if(!client||!user||!dirty||blocked||saving||!window.MedAtlasApp) return;
    if(!navigator.onLine){status('Offline — sincronização pendente','warning');return;}
    saving=true;clearTimeout(saveTimer);
    const snapshot=window.MedAtlasApp.getState(), sentSerial=serial, expected=revision;
    status('Sincronizando...','warning');
    try{
      let result;
      if(expected===0){
        result=await client.from('medatlas_state').insert({user_id:user.id,data:snapshot,revision:1}).select('data,revision').single();
        if(result.error?.code==='23505')result={data:null,error:null};
      }else{
        result=await client.from('medatlas_state').update({data:snapshot,revision:expected+1}).eq('user_id',user.id).eq('revision',expected).select('data,revision').maybeSingle();
      }
      if(result.error)throw result.error;
      if(!result.data){
        const latest=await fetchRemote();currentRow=latest;blocked=true;dirty=true;
        $('sync-warning').hidden=false;status('Conflito entre aparelhos','error');return;
      }
      revision=Number(result.data.revision);currentRow=result.data;
      if(sentSerial===serial){dirty=false;localStorage.removeItem(dirtyKey);status('Sincronizado');}
      else{dirty=true;status('Atualizando...','warning');}
    }catch(e){status('Alterações pendentes','warning');console.warn('MedAtlas sync:',e);}
    finally{saving=false;if(dirty&&!blocked&&navigator.onLine)schedule(2500);}
  }
  async function poll(){
    if(!client||!user||!window.MedAtlasApp||dirty||blocked||saving||!navigator.onLine||document.hidden)return;
    try{const remote=await fetchRemote();if(remote && Number(remote.revision)>revision && isSnapshot(remote.data)){
      // Reconfira: o usuário pode ter editado dados enquanto a requisição estava em trânsito.
      if(dirty || blocked || saving) return;
      revision=Number(remote.revision);currentRow=remote;
      window.MedAtlasApp.replaceState(remote.data);status('Atualizado neste dispositivo');
    }}catch(e){status('Sem acesso à nuvem','warning');}
  }
  function startPolling(){
    clearInterval(pollId);pollId=setInterval(poll,20000);
    window.addEventListener('online',()=>{status('Reconectado','warning');dirty?schedule(0):poll();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)dirty?schedule(0):poll();});
    window.addEventListener('focus',()=>{if(!dirty)poll();});
  }
  function setTab(next){tab=next;clearAlert();$('tab-login').classList.toggle('active',tab==='login');$('tab-signup').classList.toggle('active',tab==='signup');$('auth-submit').textContent=tab==='login'?'Entrar na ESTUDNEXA':'Criar minha conta';$('auth-password').autocomplete=tab==='login'?'current-password':'new-password';}
  $('tab-login').onclick=()=>setTab('login');$('tab-signup').onclick=()=>setTab('signup');
  $('auth-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;
    const email=$('auth-email').value.trim(),password=$('auth-password').value;
    setBusy(true);clearAlert();
    try{
      let data,error;
      if(tab==='signup') ({data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}));
      else ({data,error}=await client.auth.signInWithPassword({email,password}));
      if(error)throw error;
      if(tab==='signup'&&!data.session){alertMsg('Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.');setTab('login');return;}
      const signedUser=data.user || data.session?.user;
      if(signedUser)await boot(signedUser);
    }catch(err){alertMsg(err.message||'Não foi possível autenticar.',true);}finally{setBusy(false);}
  });
  $('forgot-button').onclick=async()=>{
    if(!client)return;
    const email=($('auth-email').value||window.prompt('Digite o e-mail usado na sua conta ESTUDNEXA:')||'').trim();if(!email)return;
    try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;alertMsg('Se este e-mail tiver uma conta, você receberá instruções para redefinir a senha.');}
    catch(e){alertMsg('Não foi possível solicitar a recuperação: '+e.message,true);}
  };
  $('reset-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;
    const password=$('new-password').value;
    try{const {error}=await client.auth.updateUser({password});if(error)throw error;
      window.alert('Senha atualizada.');$('reset-screen').hidden=true;recovering=false;
      const {data}=await client.auth.getUser();if(data?.user)await boot(data.user);else showAuth();
    }catch(err){window.alert('Erro ao alterar senha: '+err.message);}
  });
  async function main(){
    showAuth();
    if(!usableConfig()){
      alertMsg('Versão 3.0 pronta para configuração: o responsável precisa conectar o Supabase antes de habilitar cadastro e sincronização.',true);
      $('auth-submit').disabled=true;$('forgot-button').disabled=true;return;
    }
    try{
      await loadSDK();
      client=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='PASSWORD_RECOVERY')showReset();
        if(event==='SIGNED_OUT' && !loading)location.reload();
      });
      const {data,error}=await client.auth.getUser();
      if(error && !/auth session missing/i.test(error.message||''))console.warn('Auth:',error.message);
      if(data?.user && !recovering)await boot(data.user);
    }catch(e){alertMsg(e.message||'Não foi possível iniciar a autenticação.',true);}
  }
  main();
})();
