"use client";
import {useEffect} from 'react';
import {installCaseNavigation} from '@/lib/cases/navigation';
export function CaseAnchorNavigation(){useEffect(()=>installCaseNavigation(),[]);return null;}
