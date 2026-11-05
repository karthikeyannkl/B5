/**
 * BORNTOWIN5 (B5) — Initial Member ID & Password Setup and Verification
 * Generates 15 strong, random, unique passwords for the 15 initial member IDs
 * + 1 strong password for Company ID.
 * Applies PBKDF2 hashes directly to remote Cloudflare D1.
 * Performs live login tests for all 16 accounts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');
const { hashPassword, verifyPassword } = require('../src/b5-engine');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no O, I
const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // no l
const DIGITS = '23456789'; // no 0, 1
const SYMBOLS = '!@#$%*';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function generateStrongPassword() {
  const parts = [
    UPPER[crypto.randomInt(0, UPPER.length)],
    UPPER[crypto.randomInt(0, UPPER.length)],
    LOWER[crypto.randomInt(0, LOWER.length)],
    LOWER[crypto.randomInt(0, LOWER.length)],
    DIGITS[crypto.randomInt(0, DIGITS.length)],
    DIGITS[crypto.randomInt(0, DIGITS.length)],
    SYMBOLS[crypto.randomInt(0, SYMBOLS.length)],
    SYMBOLS[crypto.randomInt(0, SYMBOLS.length)]
  ];
  while (parts.length < 12) {
    parts.push(ALL[crypto.randomInt(0, ALL.length)]);
  }
  // Fisher-Yates shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}

const accounts = [
  { serial: 0, memberId: 'B5-COMPANY', name: 'BORN TO WIN', mobile: '9345151709', email: 'notifications@borntowin5.com', role: 'Company Root (Level 7)' },
  { serial: 1, memberId: 'B5-64847', name: 'SATHYA', mobile: '9600680468', email: 'sweetsathya62@gmail.com', role: 'Initial Member' },
  { serial: 2, memberId: 'B5-39246', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 3, memberId: 'B5-88384', name: 'KARTHIKEYAN', mobile: '9790151709', email: 'dorakarthi51@gmail.com', role: 'Initial Member' },
  { serial: 4, memberId: 'B5-12971', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 5, memberId: 'B5-90143', name: 'RK', mobile: '9345151709', email: 'ksp.nkl@gmail.com', role: 'Initial Member' },
  { serial: 6, memberId: 'B5-54017', name: 'SATHYA', mobile: '9600680468', email: 'sweetsathya62@gmail.com', role: 'Initial Member' },
  { serial: 7, memberId: 'B5-96920', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 8, memberId: 'B5-37039', name: 'KARTHIKEYAN', mobile: '9790151709', email: 'dorakarthi51@gmail.com', role: 'Initial Member' },
  { serial: 9, memberId: 'B5-17004', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 10, memberId: 'B5-35655', name: 'RK', mobile: '9345151709', email: 'ksp.nkl@gmail.com', role: 'Initial Member' },
  { serial: 11, memberId: 'B5-71226', name: 'SATHYA', mobile: '9600680468', email: 'sweetsathya62@gmail.com', role: 'Initial Member' },
  { serial: 12, memberId: 'B5-31508', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 13, memberId: 'B5-82715', name: 'KARTHIKEYAN', mobile: '9790151709', email: 'dorakarthi51@gmail.com', role: 'Initial Member' },
  { serial: 14, memberId: 'B5-40331', name: 'ELANGO', mobile: '7867014621', email: 'kalaikalaielango@gmail.com', role: 'Initial Member' },
  { serial: 15, memberId: 'B5-75949', name: 'RK', mobile: '9345151709', email: 'ksp.nkl@gmail.com', role: 'Initial Member' }
];

async function main() {
  console.log('=== Step 1: Generating 16 Distinct Strong Passwords ===');
  const usedPasswords = new Set();
  for (const acc of accounts) {
    let pwd;
    do {
      pwd = generateStrongPassword();
    } while (usedPasswords.has(pwd));
    usedPasswords.add(pwd);
    acc.plainPassword = pwd;
    acc.passwordHash = hashPassword(pwd);
  }

  console.log(`Generated ${accounts.length} distinct passwords. Set size: ${usedPasswords.size}`);

  console.log('\n=== Step 2: Preparing SQL for Remote D1 ===');
  const sqlStatements = [
    '-- BORNTOWIN5: Update Initial Passwords to Secure PBKDF2 Hashes'
  ];

  for (const acc of accounts) {
    sqlStatements.push(
      `UPDATE members SET password_hash = '${acc.passwordHash}', must_change_password = 1 WHERE member_id = '${acc.memberId}';`
    );
  }

  const sqlFilePath = path.join(__dirname, '..', '_backups', 'update_initial_passwords.sql');
  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf8');
  console.log(`SQL written to ${sqlFilePath}`);

  console.log('\n=== Step 3: Executing SQL on Cloudflare D1 (remote) ===');
  const cmd = `npx wrangler d1 execute b5-level-tracking --remote --file="_backups/update_passwords_temp.sql" -y`;
  // Copy to safe filename without potential path issues
  const tempSql = path.join(__dirname, '..', '_backups', 'update_passwords_temp.sql');
  fs.writeFileSync(tempSql, sqlStatements.join('\n'), 'utf8');

  try {
    const res = execSync(`npx wrangler d1 execute b5-level-tracking --remote --file="_backups/update_passwords_temp.sql" -y`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    console.log('Wrangler execution result:\n', res);
  } catch (err) {
    console.error('Wrangler execution error:\n', err.stdout || err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempSql)) fs.unlinkSync(tempSql);
  }

  console.log('\n=== Step 4: Live Login Verification for All 16 Accounts ===');

  function makePostRequest(url, data) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const postData = JSON.stringify(data);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        res => {
          let body = '';
          res.on('data', chunk => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch (_) {
              resolve({ status: res.statusCode, raw: body });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  const liveBaseUrl = 'https://b5-level-tracking.dorakarthi51.workers.dev';
  const customDomainUrl = 'https://www.borntowin5.com';
  let allPassed = true;

  console.log('--- Testing Mobile Number + Password Disambiguation ---');
  for (const acc of accounts) {
    const res = await makePostRequest(`${liveBaseUrl}/api/member/login`, {
      mobile: acc.mobile,
      password: acc.plainPassword
    });

    if (res.status === 200 && res.data?.member?.memberId === acc.memberId) {
      console.log(`[PASS] Serial ${acc.serial} | Mobile ${acc.mobile} -> Logged in as ${res.data.member.memberId} (${res.data.member.name}) | MustChange: ${res.data.member.mustChangePassword}`);
    } else {
      console.error(`[FAIL] Serial ${acc.serial} | Mobile ${acc.mobile} -> Status: ${res.status}`, res.data);
      allPassed = false;
    }
  }

  console.log('\n--- Testing Member ID + Password Login ---');
  for (const acc of accounts) {
    const res = await makePostRequest(`${liveBaseUrl}/api/member/login`, {
      memberId: acc.memberId,
      password: acc.plainPassword
    });

    if (res.status === 200 && res.data?.member?.memberId === acc.memberId) {
      console.log(`[PASS] Member ID ${acc.memberId} login succeeded`);
    } else {
      console.error(`[FAIL] Member ID ${acc.memberId} login failed`, res.data);
      allPassed = false;
    }
  }

  console.log('\n--- Testing Negative Verification: Wrong Password on Shared Mobile ---');
  const wrongRes = await makePostRequest(`${liveBaseUrl}/api/member/login`, {
    mobile: '7867014621',
    password: 'CompletelyWrongPassword#999'
  });
  if (wrongRes.status === 401) {
    console.log('[PASS] Shared mobile 7867014621 with incorrect password rejected with HTTP 401 Incorrect password');
  } else {
    console.error('[FAIL] Expected 401 for wrong password, got:', wrongRes.status);
    allPassed = false;
  }

  console.log('\n--- Testing Custom Domain: https://www.borntowin5.com ---');
  const customRes = await makePostRequest(`${customDomainUrl}/api/member/login`, {
    mobile: accounts[1].mobile,
    password: accounts[1].plainPassword
  });
  if (customRes.status === 200 && customRes.data?.member?.memberId === accounts[1].memberId) {
    console.log(`[PASS] Custom domain https://www.borntowin5.com verified for ${accounts[1].memberId} (${accounts[1].name})`);
  } else {
    console.error('[FAIL] Custom domain test failed:', customRes);
    allPassed = false;
  }

  if (!allPassed) {
    console.error('\nVerification failed! Not all accounts passed.');
    process.exit(1);
  }

  console.log('\nAll 16 accounts (1 Company ID + 15 Member IDs) passed live verification!');

  // Save the Admin Credential Report
  const reportPath = path.join(__dirname, '..', '_backups', 'admin-credentials-report.json');
  const reportData = accounts.map(a => ({
    serial: a.serial,
    memberId: a.memberId,
    name: a.name,
    mobile: a.mobile,
    email: a.email,
    role: a.role,
    initialPassword: a.plainPassword
  }));
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');
  console.log(`Report data saved to ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
