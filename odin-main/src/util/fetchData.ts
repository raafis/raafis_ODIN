import axios from 'axios';

export const fetchData = async (url: string, data?: object, method?: string, timeout = 120000) => {
    try {
        const response = await axios({
            method: method || "POST",
            url,
            data,
            timeout,
        });
        return response.data;
    } catch (error) {
        console.error(`Error ${method} data:`, error);
        throw error;
    }
};