-- Script de migração para o banco de dados Supabase (PostgreSQL)
-- Adiciona colunas para controle de CPF e salvamento de cartão (PagBank) na tabela de usuários

-- Tabela de perfis de usuário (atende a tabelas com nome 'profiles' ou 'users')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cpf TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pagbank_customer_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pagbank_customer_id TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pagbank_card_token TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pagbank_card_token TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pagbank_card_brand TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pagbank_card_brand TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pagbank_card_last_digits TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pagbank_card_last_digits TEXT;

-- Adiciona índices para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON public.users(cpf);
CREATE INDEX IF NOT EXISTS idx_profiles_pagbank_cust ON public.profiles(pagbank_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_pagbank_cust ON public.users(pagbank_customer_id);
