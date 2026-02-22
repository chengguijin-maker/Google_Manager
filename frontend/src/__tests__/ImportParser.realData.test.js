import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseImportText } from '../utils/importParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const realDataPath = path.resolve(__dirname, '../../../e2e/test-data/import-test-data.txt');

const readParsed = () => {
    const text = fs.readFileSync(realDataPath, 'utf8');
    return parseImportText(text).parsed;
};

const findByEmail = (rows, email) => rows.find(
    item => item.email.toLowerCase() === email.toLowerCase(),
);

describe('ImportParser 真实数据回归', () => {
    it('解析结果不应包含空密码记录', () => {
        const parsed = readParsed();
        expect(parsed.length).toBeGreaterThan(80);
        expect(parsed.every(item => item.email && item.password)).toBe(true);
    });

    it('应正确解析 base32 形态密码与 2FA', () => {
        const parsed = readParsed();
        const row = findByEmail(parsed, 'DmDayouss559@gmail.com');
        expect(row).toBeTruthy();
        expect(row.password).toBe('gsygevwbm');
        expect(row.recovery).toBe('DmDayouss55923433@merrce.site');
        expect(row.secret).toBe('WPLVDTLTZTIRCW4K7JLAFJKP6JFJ6H5O');
    });

    it('应正确解析卡号格式中的 recovery 与 secret', () => {
        const parsed = readParsed();
        const row = findByEmail(parsed, 'GhshdbdKaocher68@gmail.com');
        expect(row).toBeTruthy();
        expect(row.password).toBe('Zhh10@666888xb22');
        expect(row.recovery).toBe('GhshdbdKaocher6864647@raink.site');
        expect(row.secret).toBe('RAZPOZIYF6W5M4KPGFUBRSBXUIAA3SPV');
    });

    it('应提取混合字段中的年份和手机号并清洗手机号格式', () => {
        const parsed = readParsed();
        const jamalRows = parsed.filter(item => item.email.toLowerCase() === 'jamalanty87@gmail.com');
        expect(jamalRows.some(item => item.phone === '+8618576762071')).toBe(true);

        const jacintheeRows = parsed.filter(item => item.email.toLowerCase() === 'jacinthee1jd666@gmail.com');
        expect(jacintheeRows.some(item => item.reg_year === '2021')).toBe(true);
        expect(jacintheeRows.some(item => item.phone === '+8618024048401')).toBe(true);
    });

    it('应过滤仅邮箱但无密码的噪声行', () => {
        const parsed = readParsed();
        expect(findByEmail(parsed, 'belocarla219@gmail.com')).toBeUndefined();
        expect(findByEmail(parsed, '940117344@qq.com')).toBeUndefined();
    });
});
