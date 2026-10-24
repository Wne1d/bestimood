import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const folder=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(folder,'..','products-data.js'),'utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const products=sandbox.window.BESTI_PRODUCTS;
const q=value=>`'${String(value??'').replaceAll("'","''")}'`;
const rows=products.map(product=>{
  const price=Number.isFinite(product.price)?String(product.price):'null';
  const sizes=JSON.stringify(product.sizeStock||{}).replaceAll("'","''");
  return `(${q(product.sku)}, ${q(product.name)}, ${price}, ${q(product.sizeMode||'one')}, '${sizes}'::jsonb, ${Number(product.oneSizeStock)||0})`;
});
const sql=`-- Generated from ../products-data.js. Rerun this script after catalog edits.\ninsert into public.catalog_products (sku, name, price, size_mode, size_stock, one_size_stock) values\n${rows.join(',\n')}\non conflict (sku) do update set name = excluded.name, price = excluded.price, size_mode = excluded.size_mode, size_stock = excluded.size_stock, one_size_stock = excluded.one_size_stock;\n`;
fs.writeFileSync(path.join(folder,'catalog-seed.sql'),sql,'utf8');
process.stdout.write(`Wrote ${products.length} catalogue rows to supabase/catalog-seed.sql\n`);
