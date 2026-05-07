import fs from 'fs';
import path from 'path';

export interface AdminSettings {
  apiUrl: string;
  adminSportId: string;
  adminMax: string;
  defaultShapkaId: string;
  timezone: string;
  dateFormat: string;
  requestMode: string;
  sslVerify: boolean;
}

export function getAdminSettings(disciplineSlug: string): AdminSettings | null {
  try {
    const configPath = path.resolve(process.cwd(), 'src/config/admin-settings.json');
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(fileContent);
    
    return config[disciplineSlug] || null;
  } catch (error) {
    console.error('Error reading admin settings config:', error);
    return null;
  }
}
