'use strict';

import { config } from 'dotenv';
import { readFileSync } from 'fs';

config(); // Load .env variables

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
export const RELEASE: string = packageJson.release.version;

export const PORT: string = process.env.PORT || '51821';
export const WEBUI_HOST: string = process.env.WEBUI_HOST || '0.0.0.0';
export const {PASSWORD_HASH} = process.env;
export const MAX_AGE: number = parseInt(process.env.MAX_AGE || '0', 10) * 1000 * 60;
export const WG_PATH: string = process.env.WG_PATH || '/etc/wireguard/';
export const WG_DEVICE: string = process.env.WG_DEVICE || 'eth0';
export const {WG_HOST} = process.env;
export const WG_PORT: string = process.env.WG_PORT || '51820';
export const WG_CONFIG_PORT: string = process.env.WG_CONFIG_PORT || WG_PORT;
export const WG_MTU: string | null = process.env.WG_MTU || null;
export const WG_PERSISTENT_KEEPALIVE: string = process.env.WG_PERSISTENT_KEEPALIVE || '0';
export const WG_DEFAULT_ADDRESS: string = process.env.WG_DEFAULT_ADDRESS || '10.8.0.x';
export const WG_DEFAULT_DNS: string = process.env.WG_DEFAULT_DNS ?? '1.1.1.1';
export const WG_ALLOWED_IPS: string = process.env.WG_ALLOWED_IPS || '0.0.0.0/0, ::/0';

export const WG_PRE_UP: string = process.env.WG_PRE_UP || '';
export const WG_POST_UP: string = (process.env.WG_POST_UP || `
iptables -t nat -A POSTROUTING -s ${WG_DEFAULT_ADDRESS.replace('x', '0')}/24 -o ${WG_DEVICE} -j MASQUERADE;
iptables -A INPUT -p udp -m udp --dport ${WG_PORT} -j ACCEPT;
iptables -A FORWARD -i wg0 -j ACCEPT;
iptables -A FORWARD -o wg0 -j ACCEPT;
`).split('\n').join(' ');

export const WG_PRE_DOWN: string = process.env.WG_PRE_DOWN || '';
export const WG_POST_DOWN: string = (process.env.WG_POST_DOWN || `
iptables -t nat -D POSTROUTING -s ${WG_DEFAULT_ADDRESS.replace('x', '0')}/24 -o ${WG_DEVICE} -j MASQUERADE;
iptables -D INPUT -p udp -m udp --dport ${WG_PORT} -j ACCEPT;
iptables -D FORWARD -i wg0 -j ACCEPT;
iptables -D FORWARD -o wg0 -j ACCEPT;
`).split('\n').join(' ');

export const LANG: string = process.env.LANG || 'en';
export const UI_TRAFFIC_STATS: string = process.env.UI_TRAFFIC_STATS || 'false';
export const UI_CHART_TYPE: number = parseInt(process.env.UI_CHART_TYPE || '0', 10);
export const WG_ENABLE_ONE_TIME_LINKS: string = process.env.WG_ENABLE_ONE_TIME_LINKS || 'false';
export const UI_ENABLE_SORT_CLIENTS: string = process.env.UI_ENABLE_SORT_CLIENTS || 'false';
export const WG_ENABLE_EXPIRES_TIME: string = process.env.WG_ENABLE_EXPIRES_TIME || 'false';
export const ENABLE_PROMETHEUS_METRICS: string = process.env.ENABLE_PROMETHEUS_METRICS || 'false';
export const { PROMETHEUS_METRICS_PASSWORD } = process.env;

export const DICEBEAR_TYPE: string | boolean = process.env.DICEBEAR_TYPE || false;
export const USE_GRAVATAR: string | boolean = process.env.USE_GRAVATAR || false;

// New env flags to control WireGuard startup behavior
export const WG_AUTO_START: string = process.env.WG_AUTO_START ?? 'true';
export const WG_ALLOW_NO_KERNEL: string = process.env.WG_ALLOW_NO_KERNEL ?? 'true';

const getRandomInt = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min));
const getRandomJunkSize = (): number => getRandomInt(15, 150);
const getRandomHeader = (): number => getRandomInt(1, 2_147_483_647);

export const JC: number = parseInt(process.env.JC || `${getRandomInt(3, 10)}`, 10);
export const JMIN: number = parseInt(process.env.JMIN || '50', 10);
export const JMAX: number = parseInt(process.env.JMAX || '1000', 10);
export const S1: number = parseInt(process.env.S1 || `${getRandomJunkSize()}`, 10);
export const S2: number = parseInt(process.env.S2 || `${getRandomJunkSize()}`, 10);
export const H1: number = parseInt(process.env.H1 || `${getRandomHeader()}`, 10);
export const H2: number = parseInt(process.env.H2 || `${getRandomHeader()}`, 10);
export const H3: number = parseInt(process.env.H3 || `${getRandomHeader()}`, 10);
export const H4: number = parseInt(process.env.H4 || `${getRandomHeader()}`, 10);
