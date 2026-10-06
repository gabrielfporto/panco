-- Mantém os nomes internos das migrations anteriores para atualização compatível.
begin;
alter table public.users add column phone text;
create function public.panco_profile_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.users set phone = nullif(trim(new.raw_user_meta_data ->> 'phone'),'')
    where id = new.id;
  return new;
end;
$$;
-- Executa depois do trigger original que cria perfil e categorias.
create trigger panco_auth_contact after insert on auth.users
  for each row execute function public.panco_profile_contact();
update public.users u set phone = nullif(trim(a.raw_user_meta_data ->> 'phone'),'')
  from auth.users a where a.id = u.id;
revoke all on function public.panco_profile_contact() from public,anon,authenticated;
commit;
