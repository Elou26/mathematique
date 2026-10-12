-- ==========================================================================
-- Mathématique — les deux tables des comptes
-- --------------------------------------------------------------------------
-- À coller dans l'éditeur SQL de ta base (Supabase : « SQL Editor », puis
-- « Run »). Une seule fois : la commande est écrite pour pouvoir être
-- relancée sans rien casser.
--
-- Deux tables, et rien de plus :
--   comptes     une ligne par élève — son adresse, sa bibliothèque ;
--   connexions  les liens magiques en attente, effacés sitôt utilisés.
-- ==========================================================================

create extension if not exists pgcrypto;        -- pour gen_random_uuid()

create table if not exists comptes (
  id              uuid primary key default gen_random_uuid(),
  courriel        text        not null unique,
  -- Fiches, journal, prénom, niveau, record : tout ce qui voyage, d'un bloc.
  donnees         jsonb       not null default '{}'::jsonb,
  -- Avance d'un cran à chaque écriture. Deux appareils qui écrivent en même
  -- temps : le second est refusé, il relit, il fusionne, il réessaie.
  version         integer     not null default 0,
  -- « Me déconnecter » l'incrémente : toutes les sessions émises avant
  -- cessent de valoir, sans table de sessions à tenir.
  jetons_version  integer     not null default 1,
  cree_le         timestamptz not null default now(),
  vu_le           timestamptz not null default now()
);

create table if not exists connexions (
  -- L'empreinte SHA-256 du jeton, jamais le jeton : qui lirait cette table
  -- ne pourrait entrer dans aucun compte.
  empreinte  text        primary key,
  courriel   text        not null,
  expire_le  timestamptz not null,
  utilise    boolean     not null default false,
  cree_le    timestamptz not null default now()
);

create index if not exists connexions_expire_le on connexions (expire_le);

-- Personne ne lit ces tables depuis un navigateur : seul le serveur y touche,
-- avec sa clé de service. On ferme donc l'accès public — « row level security »
-- sans aucune politique veut dire : rien ne passe, sauf la clé de service.
alter table comptes    enable row level security;
alter table connexions enable row level security;

-- Ménage, à lancer de temps en temps (ou par une tâche planifiée) : les liens
-- périmés ne servent plus à rien.
--   delete from connexions where expire_le < now() - interval '1 day';
