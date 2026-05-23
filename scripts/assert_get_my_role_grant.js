#!/usr/bin/env node
const fs = require('fs');
const path = 'supabase/migrations/20260523_get_my_role_grant.sql';

if (!fs.existsSync(path)) {
  throw new Error(`${path} is missing`);
}

const sql = fs.readFileSync(path, 'utf8');
const required = [
  'CREATE OR REPLACE FUNCTION public.get_my_role()',
  'SECURITY DEFINER',
  'GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated',
  'REVOKE ALL ON FUNCTION public.get_my_role() FROM anon',
];

for (const needle of required) {
  if (!sql.includes(needle)) {
    throw new Error(`Missing get_my_role grant marker: ${needle}`);
  }
}

console.log('get_my_role grant migration OK');
